import { getExercise } from '../domain/exercises';
import { VOLUME_LANDMARKS } from '../domain/research';
import type { Exercise, Muscle, Program, ProgramDay, ProgramExercise, SplitId, WorkoutSession } from '../domain/types';
import type { Reason } from './progression';
import { recommendedRest } from './progression';
import { emptyMuscleMap } from './volume';

export interface SplitInfo {
  id: SplitId;
  name: string;
  days: number[];
  frequency: string;
  pros: string[];
  cons: string[];
  reasons: Reason[];
}

export const SPLIT_INFO: Record<SplitId, SplitInfo> = {
  full_body: {
    id: 'full_body',
    name: '무분할 (전신)',
    days: [2, 3],
    frequency: '부위별 주 2~3회',
    pros: ['적은 운동 일수로도 높은 빈도', '하루 빠져도 손실이 작음', '초보~중급에 효율적'],
    cons: ['세션당 종목이 많아 시간이 김', '부위당 세션 볼륨이 제한됨'],
    reasons: [{ text: '부위별 주 2회 이상 빈도를 가장 적은 일수로 달성합니다.', citations: ['schoenfeld2016freq'] }],
  },
  upper_lower: {
    id: 'upper_lower',
    name: '상·하체 2분할',
    days: [4],
    frequency: '부위별 주 2회',
    pros: ['빈도와 세션 볼륨의 균형', '회복 스케줄이 단순'],
    cons: ['주 4일 확보 필요', '상체 날 세션이 길어지기 쉬움'],
    reasons: [{ text: '주 4일로 모든 부위를 주 2회 훈련합니다.', citations: ['schoenfeld2016freq'] }],
  },
  upper_lower_ppl: {
    id: 'upper_lower_ppl',
    name: '상·하체 + 밀기·당기기·하체 (하이브리드)',
    days: [5],
    frequency: '부위별 주 2회',
    pros: ['주 5일에서 빈도 2회 유지', '부위당 볼륨을 넉넉히 배치 가능'],
    cons: ['주 5일 확보 필요', '연속 훈련일의 회복 관리 필요'],
    reasons: [{ text: '주 5일 훈련 시에도 부위별 주 2회 빈도를 유지합니다.', citations: ['schoenfeld2016freq'] }],
  },
  ppl: {
    id: 'ppl',
    name: '밀기·당기기·하체 3분할 ×2',
    days: [6],
    frequency: '부위별 주 2회',
    pros: ['세션당 볼륨을 높게 배치', '중·상급자 고볼륨에 적합'],
    cons: ['주 6일 필요 — 회복·생활 부담', '하루 빠지면 일정이 밀림'],
    reasons: [{ text: '높은 주간 볼륨(주 15~20세트+)을 빈도 2회로 나누어 세션당 피로를 분산합니다.', citations: ['bazvalle2022', 'schoenfeld2016freq'] }],
  },
  bro: {
    id: 'bro',
    name: '부위별 5분할 (브로 분할)',
    days: [5],
    frequency: '부위별 주 1회',
    pros: ['세션 집중도 높음', '구성이 단순'],
    cons: ['부위별 빈도 주 1회 → 같은 볼륨이면 2회 분할보다 불리할 수 있음', '한 세션에 볼륨이 몰려 후반 세트 질 저하'],
    reasons: [
      {
        text: '메타분석상 주 1회보다 주 2회 이상 빈도가 근비대에 유리해 우선순위를 낮춥니다. 단, 총 볼륨이 같으면 차이가 줄어든다는 보고도 있습니다.',
        citations: ['schoenfeld2016freq', 'pelland2024'],
      },
    ],
  },
};

type DayTemplate = { name: string; exercises: string[] };

const T: Record<string, DayTemplate> = {
  FB_A: { name: '전신 A', exercises: ['squat', 'bench_press', 'barbell_row', 'lateral_raise', 'lying_leg_curl', 'triceps_pushdown'] },
  FB_B: { name: '전신 B', exercises: ['rdl', 'ohp', 'lat_pulldown', 'leg_extension', 'db_curl', 'standing_calf_raise'] },
  FB_C: { name: '전신 C', exercises: ['leg_press', 'incline_db_press', 'seated_cable_row', 'cable_lateral_raise', 'seated_leg_curl', 'cable_crunch'] },
  UPPER_A: { name: '상체 A', exercises: ['bench_press', 'barbell_row', 'ohp', 'lat_pulldown', 'lateral_raise', 'db_curl', 'triceps_pushdown'] },
  LOWER_A: { name: '하체 A', exercises: ['squat', 'rdl', 'leg_extension', 'lying_leg_curl', 'standing_calf_raise', 'cable_crunch'] },
  UPPER_B: { name: '상체 B', exercises: ['incline_db_press', 'chest_supported_row', 'pull_up', 'cable_lateral_raise', 'face_pull', 'incline_db_curl', 'overhead_triceps_ext'] },
  LOWER_B: { name: '하체 B', exercises: ['hack_squat', 'hip_thrust', 'bulgarian_split_squat', 'seated_leg_curl', 'seated_calf_raise', 'hanging_leg_raise'] },
  PUSH_A: { name: '밀기 A', exercises: ['bench_press', 'incline_db_press', 'ohp', 'lateral_raise', 'triceps_pushdown', 'overhead_triceps_ext'] },
  PULL_A: { name: '당기기 A', exercises: ['pull_up', 'barbell_row', 'seated_cable_row', 'face_pull', 'barbell_curl', 'hammer_curl'] },
  LEGS_A: { name: '하체 A', exercises: ['squat', 'rdl', 'leg_press', 'lying_leg_curl', 'standing_calf_raise', 'cable_crunch'] },
  PUSH_B: { name: '밀기 B', exercises: ['incline_bench', 'machine_chest_press', 'db_shoulder_press', 'cable_lateral_raise', 'cable_fly', 'skull_crusher'] },
  PULL_B: { name: '당기기 B', exercises: ['lat_pulldown', 'chest_supported_row', 'db_row', 'rear_delt_fly', 'incline_db_curl', 'preacher_curl'] },
  LEGS_B: { name: '하체 B', exercises: ['hack_squat', 'hip_thrust', 'bulgarian_split_squat', 'seated_leg_curl', 'seated_calf_raise', 'hanging_leg_raise'] },
  BRO_CHEST: { name: '가슴', exercises: ['bench_press', 'incline_db_press', 'machine_chest_press', 'cable_fly', 'pec_deck'] },
  BRO_BACK: { name: '등', exercises: ['pull_up', 'barbell_row', 'lat_pulldown', 'seated_cable_row', 'straight_arm_pulldown'] },
  BRO_SHOULDER: { name: '어깨', exercises: ['ohp', 'lateral_raise', 'cable_lateral_raise', 'rear_delt_fly', 'face_pull', 'shrug'] },
  BRO_LEGS: { name: '하체', exercises: ['squat', 'rdl', 'leg_press', 'leg_extension', 'lying_leg_curl', 'standing_calf_raise'] },
  BRO_ARMS: { name: '팔', exercises: ['close_grip_bench', 'barbell_curl', 'triceps_pushdown', 'incline_db_curl', 'overhead_triceps_ext', 'hammer_curl'] },
};

function templatesFor(split: SplitId, daysPerWeek: number): DayTemplate[] {
  switch (split) {
    case 'full_body':
      return daysPerWeek >= 3 ? [T.FB_A!, T.FB_B!, T.FB_C!] : [T.FB_A!, T.FB_B!];
    case 'upper_lower':
      return [T.UPPER_A!, T.LOWER_A!, T.UPPER_B!, T.LOWER_B!];
    case 'upper_lower_ppl':
      return [T.UPPER_A!, T.LOWER_A!, T.PUSH_B!, T.PULL_B!, T.LEGS_B!];
    case 'ppl':
      return daysPerWeek >= 6
        ? [T.PUSH_A!, T.PULL_A!, T.LEGS_A!, T.PUSH_B!, T.PULL_B!, T.LEGS_B!]
        : [T.PUSH_A!, T.PULL_A!, T.LEGS_A!];
    case 'bro':
      return [T.BRO_CHEST!, T.BRO_BACK!, T.BRO_SHOULDER!, T.BRO_LEGS!, T.BRO_ARMS!];
  }
}

export function recommendSplit(daysPerWeek: number): SplitId {
  if (daysPerWeek <= 3) return 'full_body';
  if (daysPerWeek === 4) return 'upper_lower';
  if (daysPerWeek === 5) return 'upper_lower_ppl';
  return 'ppl';
}

const HIGH_REP = new Set(['lateral_raise', 'cable_lateral_raise', 'rear_delt_fly', 'face_pull', 'standing_calf_raise', 'seated_calf_raise', 'cable_crunch', 'hanging_leg_raise', 'wrist_curl', 'shrug']);

export function defaultRepRange(ex: Exercise): [number, number] {
  if (ex.id === 'deadlift') return [5, 8];
  if (HIGH_REP.has(ex.id)) return [12, 20];
  if (ex.compound) return [6, 10];
  return [10, 15];
}

/** 세트 1개 소요 시간(초): 수행 ~40초 + 휴식 */
export function dayDurationMin(day: ProgramDay): number {
  const sec = day.exercises.reduce((a, e) => a + e.sets * (40 + e.restSec), 0);
  return Math.round(sec / 60) + 5; // 워밍업 5분
}

/** 프로그램의 주간 근육별 볼륨 (직접 1, 간접 0.5) — 한 주에 모든 day 를 1회씩 수행한다고 가정 */
export function programWeeklyVolume(days: ProgramDay[], daysPerWeek = days.length): Record<Muscle, number> {
  const out = emptyMuscleMap();
  const scale = daysPerWeek / days.length;
  for (const d of days) {
    for (const pe of d.exercises) {
      const ex = getExercise(pe.exerciseId);
      if (!ex) continue;
      for (const [m, c] of Object.entries(ex.muscles) as [Muscle, number][]) out[m] += pe.sets * c * scale;
    }
  }
  for (const m of Object.keys(out) as Muscle[]) out[m] = Math.round(out[m] * 10) / 10;
  return out;
}

export function volumeTarget(m: Muscle, priorities: Muscle[]): number {
  const l = VOLUME_LANDMARKS[m];
  // 메소사이클 시작은 MEV~MAV 하한 사이에서 출발하고, 주차별로 세트를 늘려간다
  return priorities.includes(m) ? l.mavLow + 2 : Math.round((l.mev + l.mavLow) / 2);
}

export interface GenerateInput {
  daysPerWeek: number;
  sessionMinutes: number;
  priorities: Muscle[];
  splitId?: SplitId;
  mesoWeeks?: number;
  now?: number;
}

export function generateProgram(input: GenerateInput): Program {
  const daysPerWeek = Math.max(2, Math.min(6, Math.round(input.daysPerWeek)));
  const splitId = input.splitId ?? recommendSplit(daysPerWeek);
  const templates = templatesFor(splitId, daysPerWeek);

  const days: ProgramDay[] = templates.map((t, i) => ({
    id: `${splitId}-${i}`,
    name: t.name,
    exercises: t.exercises
      .map((id) => getExercise(id))
      .filter((e): e is Exercise => !!e)
      .map((ex): ProgramExercise => {
        const [repMin, repMax] = defaultRepRange(ex);
        return { exerciseId: ex.id, sets: 2, repMin, repMax, restSec: recommendedRest(ex) };
      }),
  }));

  // 1) 시간 예산을 넘으면 뒤쪽 고립 종목부터 제거
  for (const d of days) {
    while (dayDurationMin(d) > input.sessionMinutes && d.exercises.length > 3) {
      const idx = [...d.exercises].reverse().findIndex((pe) => !getExercise(pe.exerciseId)?.compound);
      const removeAt = idx >= 0 ? d.exercises.length - 1 - idx : d.exercises.length - 1;
      d.exercises.splice(removeAt, 1);
    }
  }

  // 2) 근육별 목표 볼륨까지 탐욕적으로 세트 추가 (시간 예산 내)
  const targets = Object.fromEntries(
    (Object.keys(VOLUME_LANDMARKS) as Muscle[]).map((m) => [m, volumeTarget(m, input.priorities)]),
  ) as Record<Muscle, number>;

  for (let iter = 0; iter < 300; iter++) {
    const vol = programWeeklyVolume(days, daysPerWeek);
    const deficits = (Object.keys(targets) as Muscle[])
      .map((m) => ({ m, d: targets[m] - vol[m] }))
      .filter((x) => x.d >= 0.5)
      .sort((a, b) => b.d - a.d);
    let added = false;
    for (const { m } of deficits) {
      const candidates = days
        .flatMap((d) => d.exercises.map((pe) => ({ d, pe })))
        .filter(({ d, pe }) => {
          const ex = getExercise(pe.exerciseId);
          return (
            ex &&
            (ex.muscles[m] ?? 0) >= 1 &&
            pe.sets < 5 &&
            dayDurationMin(d) + (40 + pe.restSec) / 60 <= input.sessionMinutes
          );
        })
        .sort((a, b) => a.pe.sets - b.pe.sets);
      const pick = candidates[0];
      if (pick) {
        pick.pe.sets += 1;
        added = true;
        break;
      }
    }
    if (!added) break;
  }

  const info = SPLIT_INFO[splitId];
  return {
    name: `${info.name} · 주 ${daysPerWeek}일`,
    splitId,
    createdAt: input.now ?? Date.now(),
    active: true,
    days,
    mesoStart: input.now ?? Date.now(),
    mesoWeeks: input.mesoWeeks ?? 4,
    priorities: input.priorities,
  };
}

/** 마지막으로 수행한 day 다음 순서의 day 를 반환 */
export function nextProgramDay(program: Program, sessions: WorkoutSession[]): ProgramDay | undefined {
  const done = sessions
    .filter((s) => s.programId === program.id && s.dayId && s.endedAt)
    .sort((a, b) => b.startedAt - a.startedAt);
  const lastDayId = done[0]?.dayId;
  const idx = program.days.findIndex((d) => d.id === lastDayId);
  return program.days[(idx + 1) % program.days.length];
}
