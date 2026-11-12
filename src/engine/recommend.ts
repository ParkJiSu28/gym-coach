import { getExercise } from '../domain/exercises';
import { VOLUME_LANDMARKS } from '../domain/research';
import { MUSCLE_LABEL, type Checkin, type Exercise, type Muscle, type Program, type ProgramDay, type SetLog, type WorkoutSession } from '../domain/types';
import { buildContext, planDay, type ExercisePlan } from './planner';
import { recommendedRest, type Reason } from './progression';
import { formatWeekdays, scheduleWarnings, sortWeekdays } from './schedule';
import { defaultRepRange, generateProgram, SPLIT_INFO } from './splits';
import { isHardSet, muscleVolume, WEEK_MS } from './volume';

const WINDOW = 4 * WEEK_MS;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function recentHard(sets: SetLog[], now: number): SetLog[] {
  return sets.filter((s) => isHardSet(s) && s.completedAt <= now && s.completedAt >= now - WINDOW);
}

/** 기록 기간(주) — 최소 1주, 최대 4주 */
function spanWeeks(sets: SetLog[], now: number): number {
  const first = sets.reduce((m, s) => Math.min(m, s.completedAt), now);
  return clamp((now - first) / WEEK_MS, 1, 4);
}

const localDayKey = (ts: number) => new Date(ts).toDateString();

/** 최근 4주 실제 운동 일수(주 평균). 기록 없으면 3, 2~6 범위 */
export function inferTrainingDays(sets: SetLog[], now: number): number {
  const hard = recentHard(sets, now);
  if (hard.length === 0) return 3;
  const days = new Set(hard.map((s) => localDayKey(s.completedAt))).size;
  return clamp(Math.round(days / spanWeeks(hard, now)), 2, 6);
}

const DEFAULT_WEEKDAYS: Record<number, number[]> = {
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
};

/** 최근 4주 동안 자주 운동한 요일 n개. 부족하면 하루씩 띄운 기본 요일로 채움 */
export function inferWeekdays(sets: SetLog[], now: number, n: number): number[] {
  const count = clamp(Math.round(n), 2, 6);
  const dayKeys = new Map<string, number>();
  for (const s of recentHard(sets, now)) dayKeys.set(localDayKey(s.completedAt), new Date(s.completedAt).getDay());
  const freq = new Map<number, number>();
  for (const wd of dayKeys.values()) freq.set(wd, (freq.get(wd) ?? 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || ((a[0] + 6) % 7) - ((b[0] + 6) % 7)).map(([wd]) => wd);
  const picked = ranked.slice(0, count);
  if (picked.length === 0) return [...DEFAULT_WEEKDAYS[count]!];
  // 남은 요일은 이미 고른 요일과 최대한 떨어지게 채운다 (연속 운동일 → 회복 부족 방지)
  const gap = (a: number, b: number) => Math.min((a - b + 7) % 7, (b - a + 7) % 7);
  while (picked.length < count) {
    let best = -1;
    let bestGap = -1;
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      if (picked.includes(d)) continue;
      const g = Math.min(...picked.map((p) => gap(p, d)));
      if (g > bestGap) {
        best = d;
        bestGap = g;
      }
    }
    picked.push(best);
  }
  return sortWeekdays(picked);
}

/** 완료된 실제(직접 입력 제외) 세션의 평균 시간, 5분 단위·30~120분. 없으면 60 */
export function inferSessionMinutes(sessions: WorkoutSession[], now: number): number {
  const done = sessions.filter((s) => !s.manual && s.endedAt && s.startedAt >= now - 8 * WEEK_MS);
  if (done.length === 0) return 60;
  const avg = done.reduce((a, s) => a + (s.endedAt! - s.startedAt) / 60_000, 0) / done.length;
  return clamp(Math.round(avg / 5) * 5, 30, 120);
}

/** 최근 4주 부위별 주평균 환산 세트 */
export function averageWeeklyVolume(sets: SetLog[], now: number): Record<Muscle, number> {
  const hard = recentHard(sets, now);
  const vol = muscleVolume(hard, now - WINDOW, now + 1);
  const span = spanWeeks(hard, now);
  for (const m of Object.keys(vol) as Muscle[]) vol[m] = Math.round((vol[m] / span) * 10) / 10;
  return vol;
}

/** 훈련은 했지만 최적 범위 하한보다 크게(25%+) 모자란 부위, 부족한 순서로 최대 max 개 */
export function laggingMuscles(sets: SetLog[], now: number, max = 2): Muscle[] {
  if (recentHard(sets, now).length === 0) return [];
  const avg = averageWeeklyVolume(sets, now);
  return (Object.keys(avg) as Muscle[])
    .filter((m) => avg[m] > 0 && VOLUME_LANDMARKS[m].mev > 0 && avg[m] < VOLUME_LANDMARKS[m].mavLow)
    .map((m) => ({ m, ratio: (VOLUME_LANDMARKS[m].mavLow - avg[m]) / VOLUME_LANDMARKS[m].mavLow }))
    .filter((x) => x.ratio > 0.25)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, max)
    .map((x) => x.m);
}

const primaries = (e: Exercise): Muscle[] =>
  (Object.entries(e.muscles) as [Muscle, number][]).filter(([, c]) => c >= 1).map(([m]) => m);

export interface Substitution {
  dayId: string;
  from: string;
  to: string;
}

/** 템플릿 종목 중 기록이 없는 것을, 같은 주동근·같은 유형의 "내가 하던 종목"으로 교체. 원본 불변 */
export function personalizeProgram(program: Program, sets: SetLog[]): { program: Program; substitutions: Substitution[] } {
  const counts = new Map<string, number>();
  for (const s of sets) if (!s.warmup && getExercise(s.exerciseId)) counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1);
  if (counts.size === 0) return { program, substitutions: [] };
  const recorded = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => getExercise(id)!);

  const substitutions: Substitution[] = [];
  const days: ProgramDay[] = program.days.map((d) => {
    const used = new Set(d.exercises.map((e) => e.exerciseId));
    const exercises = d.exercises.map((pe) => {
      if (counts.has(pe.exerciseId)) return pe;
      const slot = getExercise(pe.exerciseId);
      const main = slot ? primaries(slot)[0] : undefined;
      if (!slot || !main) return pe;
      const pick = recorded.find((r) => !used.has(r.id) && r.compound === slot.compound && primaries(r).includes(main));
      if (!pick) return pe;
      used.add(pick.id);
      substitutions.push({ dayId: d.id, from: pe.exerciseId, to: pick.id });
      const [repMin, repMax] = defaultRepRange(pick);
      return { exerciseId: pick.id, sets: pe.sets, repMin, repMax, restSec: recommendedRest(pick) };
    });
    return { ...d, exercises };
  });
  return { program: { ...program, days }, substitutions };
}

export interface RecommendInput {
  sets: SetLog[];
  sessions: WorkoutSession[];
  checkins: Checkin[];
  now: number;
  overrides?: { daysPerWeek?: number; sessionMinutes?: number; priorities?: Muscle[]; weekdays?: number[] };
}

export interface Recommendation {
  hasRecords: boolean;
  program: Program;
  daysPerWeek: number;
  sessionMinutes: number;
  priorities: Muscle[];
  plans: { day: ProgramDay; exercises: ExercisePlan[] }[];
  substitutions: Substitution[];
  insights: Reason[];
}

/** 버튼 하나: 내 기록 → 분할·요일·종목·세트·무게·반복·휴식 */
export function recommendFromRecords(input: RecommendInput): Recommendation {
  const { sets, sessions, checkins, now, overrides = {} } = input;
  const hasRecords = sets.some((s) => !s.warmup);
  const chosenWeekdays = overrides.weekdays && overrides.weekdays.length > 0 ? sortWeekdays(overrides.weekdays).slice(0, 6) : undefined;

  const daysPerWeek = clamp(chosenWeekdays?.length ?? overrides.daysPerWeek ?? inferTrainingDays(sets, now), 2, 6);
  const weekdays = chosenWeekdays && chosenWeekdays.length >= 2 ? chosenWeekdays : inferWeekdays(sets, now, daysPerWeek);
  const sessionMinutes = overrides.sessionMinutes ?? inferSessionMinutes(sessions, now);
  const priorities = overrides.priorities ?? laggingMuscles(sets, now);

  const base = generateProgram({ daysPerWeek, sessionMinutes, priorities, now, weekdays });
  const { program, substitutions } = personalizeProgram(base, sets);
  const ctx = buildContext({ now, sets, checkins, program });
  const plans = program.days.map((day) => ({ day, exercises: planDay(ctx, day) }));

  const split = SPLIT_INFO[program.splitId];
  const insights: Reason[] = [];
  if (!hasRecords) {
    insights.push({
      text: '기록이 없어 기본값(주 3일 · 60분)으로 만들었습니다. 지난 기록을 입력하면 무게·횟수까지 내 수준에 맞춰 드립니다.',
      citations: [],
    });
  } else {
    const n = new Set(sets.filter((s) => !s.warmup).map((s) => s.exerciseId)).size;
    insights.push({
      text: `기록된 ${n}개 종목의 최근 수행으로 무게·반복을 계산했습니다. 범위 안에서 반복을 먼저 늘리고, 상한에 닿으면 무게를 올립니다.`,
      citations: ['plotkin2022', 'helms2016'],
    });
  }

  const daySource = chosenWeekdays ? '선택한 요일' : hasRecords ? `최근 4주 기록상 주 ${daysPerWeek}일 운동` : '기본 일정';
  insights.push({
    text: `${daySource}: ${formatWeekdays(weekdays)} 주 ${daysPerWeek}일 → ${split.name} (${split.frequency})`,
    citations: ['schoenfeld2016freq'],
  });
  insights.push(...scheduleWarnings(program.splitId, weekdays));

  if (overrides.sessionMinutes === undefined && sessions.some((s) => !s.manual && s.endedAt)) {
    insights.push({ text: `실제 운동 시간 평균 약 ${sessionMinutes}분에 맞춰 종목·세트 수를 조정했습니다.`, citations: [] });
  }

  if (overrides.priorities === undefined && priorities.length > 0) {
    const avg = averageWeeklyVolume(sets, now);
    for (const m of priorities) {
      insights.push({
        text: `${MUSCLE_LABEL[m]}: 최근 4주 주평균 ${avg[m]}세트 — 최적 범위 하한(${VOLUME_LANDMARKS[m].mavLow}세트) 미만 → 우선 부위로 볼륨을 더 배정했습니다.`,
        citations: ['schoenfeld2017volume', 'bazvalle2022'],
      });
    }
  }

  for (const s of substitutions.filter((x, i, arr) => arr.findIndex((y) => y.from === x.from && y.to === x.to) === i)) {
    insights.push({ text: `자주 하던 ${getExercise(s.to)?.name}을(를) ${getExercise(s.from)?.name} 자리에 배치했습니다.`, citations: [] });
  }

  insights.push({
    text: '근비대 중심 처방: 복합 6~12회 · 고립 10~20회, 실패 1~3회 전까지(주차가 갈수록 가깝게), 복합 2.5분 · 고립 1.5분 휴식.',
    citations: ['schoenfeld2021continuum', 'robinson2024', 'schoenfeld2016rest'],
  });

  return { hasRecords, program, daysPerWeek, sessionMinutes, priorities, plans, substitutions, insights };
}
