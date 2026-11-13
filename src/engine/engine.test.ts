import { describe, expect, it } from 'vitest';
import { getExercise } from '../domain/exercises';
import type { Checkin, Muscle, Program, SetLog } from '../domain/types';
import { deloadAdvice, detectPlateau } from './analysis';
import { epley, estimate1RM, roundToIncrement, weightForTarget } from './e1rm';
import { effortFactor, hoursUntilRecovered, muscleRecovery, readinessScore, systemicLoad } from './fatigue';
import { adjustSets, exerciseHistory, mesoPosition, suggestNext, targetRir, type ExerciseSession } from './progression';
import { dayDurationMin, defaultRepRange, generateProgram, nextProgramDay, programWeeklyVolume, recommendSplit } from './splits';
import { DAY_MS, emptyMuscleMap, isHardSet, muscleFrequency, muscleVolume, volumeStatus, WEEK_MS, weeklyVolume } from './volume';

const H = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 5, 10);

let nextId = 1;
function set(p: Partial<SetLog> & Pick<SetLog, 'exerciseId'>): SetLog {
  return { sessionId: 1, order: nextId, weight: 100, reps: 8, rir: 2, completedAt: T0, id: nextId++, ...p };
}

function session(sessionId: number, date: number, exerciseId: string, rows: [number, number, number][]): SetLog[] {
  return rows.map(([weight, reps, rir], i) =>
    set({ sessionId, exerciseId, weight, reps, rir, order: i, completedAt: date + i * 3 * 60 * 1000 }),
  );
}

const bench = getExercise('bench_press')!;
const fullRecovery = (): Record<Muscle, number> => {
  const m = emptyMuscleMap();
  for (const k of Object.keys(m) as Muscle[]) m[k] = 100;
  return m;
};

describe('e1rm', () => {
  it('Epley 공식', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 10)).toBeCloseTo(133.33, 1);
    expect(epley(0, 5)).toBe(0);
  });
  it('RIR 보정: 8회 + RIR2 = 10회 실패와 동일', () => {
    expect(estimate1RM(100, 8, 2)).toBeCloseTo(epley(100, 10));
  });
  it('역산은 추정의 역함수', () => {
    const e1 = estimate1RM(80, 8, 2);
    expect(weightForTarget(e1, 8, 2)).toBeCloseTo(80);
    expect(weightForTarget(0, 8, 2)).toBe(0);
    expect(weightForTarget(120, 1, 0)).toBe(120);
  });
  it('증량 단위 반올림', () => {
    expect(roundToIncrement(83.7, 2.5)).toBe(82.5);
    expect(roundToIncrement(83.7, 2.5, 'up')).toBe(85);
    expect(roundToIncrement(84.9, 2.5, 'down')).toBe(82.5);
    expect(roundToIncrement(85, 2.5, 'down')).toBe(85);
    expect(roundToIncrement(12.34, 0)).toBe(12.3);
  });
});

describe('volume', () => {
  it('워밍업과 RIR 5 이상은 하드 세트가 아님', () => {
    expect(isHardSet(set({ exerciseId: 'bench_press', rir: 4 }))).toBe(true);
    expect(isHardSet(set({ exerciseId: 'bench_press', rir: 5 }))).toBe(false);
    expect(isHardSet(set({ exerciseId: 'bench_press', warmup: true }))).toBe(false);
  });
  it('직접 1세트, 간접 0.5세트로 환산', () => {
    const sets = [set({ exerciseId: 'bench_press' }), set({ exerciseId: 'bench_press' }), set({ exerciseId: 'unknown' })];
    const v = muscleVolume(sets, T0 - 1, T0 + 1);
    expect(v.chest).toBe(2);
    expect(v.triceps).toBe(1);
    expect(v.quads).toBe(0);
  });
  it('7일 롤링 윈도우', () => {
    const sets = [set({ exerciseId: 'squat', completedAt: T0 - 8 * DAY_MS }), set({ exerciseId: 'squat', completedAt: T0 - DAY_MS })];
    expect(weeklyVolume(sets, T0).quads).toBe(1);
  });
  it('볼륨 상태 판정', () => {
    expect(volumeStatus('chest', 4)).toBe('below_mev');
    expect(volumeStatus('chest', 9)).toBe('low');
    expect(volumeStatus('chest', 14)).toBe('optimal');
    expect(volumeStatus('chest', 21)).toBe('high');
    expect(volumeStatus('chest', 30)).toBe('over_mrv');
    expect(volumeStatus('abs', 0)).toBe('below_mev');
    expect(volumeStatus('abs', 2)).toBe('low');
  });
  it('주간 빈도는 직접 자극 일수', () => {
    const sets = [
      set({ exerciseId: 'bench_press', completedAt: T0 }),
      set({ exerciseId: 'bench_press', completedAt: T0 + 1000 }),
      set({ exerciseId: 'bench_press', completedAt: T0 + 3 * DAY_MS }),
      set({ exerciseId: 'nope', completedAt: T0 }),
    ];
    const f = muscleFrequency(sets, T0 - DAY_MS, T0 + WEEK_MS);
    expect(f.chest).toBe(2);
    expect(f.triceps).toBe(0);
  });
});

describe('fatigue', () => {
  it('실패 근접도별 피로 가중치', () => {
    expect(effortFactor(0)).toBe(1);
    expect(effortFactor(2)).toBe(0.85);
    expect(effortFactor(4)).toBe(0.6);
    expect(effortFactor(6)).toBe(0.3);
  });
  it('세션 직후 피로, 회복 시간이 지나면 ~90% 회복', () => {
    const sets = session(1, T0, 'bench_press', Array(8).fill([100, 8, 0]));
    const right = muscleRecovery(sets, T0 + 30 * 60 * 1000);
    expect(right.chest).toBeLessThan(5);
    expect(right.quads).toBe(100);
    const later = muscleRecovery(sets, T0 + 60 * H);
    expect(later.chest).toBeGreaterThanOrEqual(89);
  });
  it('미래 세트·워밍업·알 수 없는 종목은 무시', () => {
    const sets = [set({ exerciseId: 'squat', completedAt: T0 + H }), set({ exerciseId: 'squat', warmup: true }), set({ exerciseId: 'x' })];
    expect(muscleRecovery(sets, T0).quads).toBe(100);
  });
  it('회복까지 남은 시간', () => {
    const sets = session(1, T0, 'squat', Array(6).fill([100, 8, 1]));
    const h = hoursUntilRecovered(sets, 'quads', T0 + 20 * 60 * 1000);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(72);
    expect(hoursUntilRecovered([], 'quads', T0)).toBe(0);
    const brutal = session(1, T0, 'squat', Array(400).fill([100, 8, 0])).map((s) => ({ ...s, completedAt: T0 }));
    expect(hoursUntilRecovered(brutal, 'quads', T0, 100)).toBe(168);
  });
  it('컨디션 점수', () => {
    expect(readinessScore(undefined)).toBeNull();
    expect(readinessScore({ date: 0, sleep: 5, soreness: 5, motivation: 5, stress: 5 })).toBe(100);
    expect(readinessScore({ date: 0, sleep: 1, soreness: 1, motivation: 1, stress: 1 })).toBe(0);
  });
  it('전신 부하(급성:만성) 비율', () => {
    expect(systemicLoad([], T0).level).toBe('low');
    const sets: SetLog[] = [];
    for (let w = 3; w >= 1; w--) for (let i = 0; i < 10; i++) sets.push(set({ exerciseId: 'squat', completedAt: T0 - w * WEEK_MS + i * H }));
    for (let i = 0; i < 20; i++) sets.push(set({ exerciseId: 'squat', completedAt: T0 - 2 * DAY_MS + i * H }));
    expect(systemicLoad(sets, T0).level).toBe('high');
    expect(systemicLoad([set({ exerciseId: 'squat', completedAt: T0 - DAY_MS })], T0).ratio).toBeNull();
  });
});

describe('mesocycle', () => {
  const prog = { mesoStart: T0, mesoWeeks: 4 };
  it('주차와 디로딩 주 계산', () => {
    expect(mesoPosition(prog, T0)).toMatchObject({ week: 1, isDeload: false, cycle: 1 });
    expect(mesoPosition(prog, T0 + 4 * WEEK_MS + DAY_MS)).toMatchObject({ week: 5, isDeload: true });
    expect(mesoPosition(prog, T0 + 5 * WEEK_MS)).toMatchObject({ week: 1, cycle: 2 });
  });
  it('주차별 목표 RIR: 3 → 1(복합) / 0(고립), 디로딩 4', () => {
    const at = (w: number) => mesoPosition(prog, T0 + (w - 1) * WEEK_MS);
    expect(targetRir(at(1), true)).toBe(3);
    expect(targetRir(at(4), true)).toBe(1);
    expect(targetRir(at(4), false)).toBe(0);
    expect(targetRir(at(5), true)).toBe(4);
    expect(targetRir({ week: 1, totalWeeks: 1, isDeload: false, cycle: 1 }, false)).toBe(0);
  });
});

describe('progression: suggestNext', () => {
  const base = { exercise: bench, repMin: 6, repMax: 10, targetRir: 2, plannedSets: 3 };
  const hist = (rows: [number, number, number][]): ExerciseSession[] => [
    { sessionId: 9, date: T0, sets: session(9, T0, 'bench_press', rows) },
  ];

  it('기록이 없으면 기준점 측정', () => {
    const s = suggestNext({ ...base, history: [] });
    expect(s.action).toBe('start');
    expect(s.weight).toBeNull();
  });

  it('모든 세트 상한 달성 → 증량 (최소 1단위, 최대 +10%)', () => {
    const s = suggestNext({ ...base, history: hist([[100, 10, 2], [100, 10, 2], [100, 10, 2]]) });
    expect(s.action).toBe('increase_load');
    expect(s.weight).toBeGreaterThanOrEqual(102.5);
    expect(s.weight).toBeLessThanOrEqual(110);
    expect(s.repsTarget).toBe(6);
    expect(s.reasons.at(-1)!.citations).toContain('schoenfeld2017load');
  });

  it('범위 내 → 같은 무게로 반복 +1', () => {
    const s = suggestNext({ ...base, history: hist([[100, 8, 2], [100, 7, 2], [100, 7, 2]]) });
    expect(s.action).toBe('add_reps');
    expect(s.weight).toBe(100);
    expect(s.repsTarget).toBe(8);
  });

  it('하한 미달 → 감량', () => {
    const s = suggestNext({ ...base, history: hist([[100, 5, 0], [100, 4, 0], [100, 4, 0]]) });
    expect(s.action).toBe('decrease_load');
    expect(s.weight).toBeLessThanOrEqual(97.5);
  });

  it('목표보다 실패에 너무 가까움 → 유지', () => {
    const s = suggestNext({ ...base, targetRir: 3, history: hist([[100, 8, 0], [100, 8, 0], [100, 8, 1]]) });
    expect(s.action).toBe('hold');
    expect(s.weight).toBe(100);
  });

  it('디로딩: 세트 절반, 무게 10% 감소, RIR 4', () => {
    const s = suggestNext({ ...base, deload: true, history: hist([[100, 8, 2]]) });
    expect(s.action).toBe('deload');
    expect(s.sets).toBe(2);
    expect(s.weight).toBe(90);
    expect(s.rir).toBe(4);
  });

  it('수행 5% 이상 하락과 짧은 휴식을 경고', () => {
    const prev: ExerciseSession = { sessionId: 8, date: T0 - WEEK_MS, sets: session(8, T0 - WEEK_MS, 'bench_press', [[110, 8, 2]]) };
    const last = session(9, T0, 'bench_press', [[100, 8, 2], [100, 8, 2]]).map((s, i) => (i ? { ...s, restSec: 45 } : s));
    const s = suggestNext({ ...base, history: [prev, { sessionId: 9, date: T0, sets: last }] });
    expect(s.performanceDrop).toBe(true);
    const cites = s.reasons.flatMap((r) => r.citations);
    expect(cites).toContain('bell2023');
    expect(cites).toContain('singer2024');
  });

  it('RIR 이 추정값이면 "실패에 너무 가까움 → 유지" 규칙을 적용하지 않음', () => {
    const rows = session(9, T0, 'bench_press', [[100, 8, 0], [100, 8, 0]]).map((s) => ({ ...s, rirEstimated: true }));
    const s = suggestNext({ ...base, targetRir: 3, history: [{ sessionId: 9, date: T0, sets: rows }] });
    expect(s.action).toBe('add_reps');
  });

  it('맨몸(증량 단위 0)은 하한 미달이어도 무게 유지', () => {
    const push = getExercise('push_up')!;
    const s = suggestNext({ ...base, exercise: push, history: [{ sessionId: 1, date: T0, sets: session(1, T0, 'push_up', [[0, 4, 0]]) }] });
    expect(s.action).toBe('hold');
  });

  it('세션 이력 그룹화(워밍업 제외, 날짜순)', () => {
    const sets = [
      ...session(2, T0 + DAY_MS, 'bench_press', [[100, 8, 2]]),
      ...session(1, T0, 'bench_press', [[95, 8, 2]]),
      set({ exerciseId: 'bench_press', sessionId: 1, warmup: true }),
    ];
    const h = exerciseHistory(sets, 'bench_press');
    expect(h.map((x) => x.sessionId)).toEqual([1, 2]);
    expect(h[0]!.sets).toHaveLength(1);
  });
});

describe('progression: adjustSets', () => {
  it('회복 부족·컨디션 저하 시 감소', () => {
    const r = adjustSets({
      exercise: bench,
      plannedSets: 4,
      weekly: { ...emptyMuscleMap(), chest: 12 },
      recovery: { ...fullRecovery(), chest: 30 },
      readiness: 20,
      deload: false,
    });
    expect(r.sets).toBe(2);
    expect(r.reasons).toHaveLength(2);
  });
  it('첫 세션(기록 없음)은 계획 세트 그대로', () => {
    const r = adjustSets({ exercise: bench, plannedSets: 3, weekly: emptyMuscleMap(), recovery: fullRecovery(), readiness: null, deload: false });
    expect(r.sets).toBe(3);
  });
  it('기록 있고 MEV 미만·회복 양호하면 1세트 추가', () => {
    const r = adjustSets({ exercise: bench, plannedSets: 3, weekly: emptyMuscleMap(), recovery: fullRecovery(), readiness: null, deload: false, hasHistory: true });
    expect(r.sets).toBe(4);
    expect(r.reasons[0]!.citations).toContain('schoenfeld2017volume');
  });
  it('메소 2주차부터는 최적 하한까지 점진 증가', () => {
    const weekly = { ...emptyMuscleMap(), chest: 10 }; // MEV 8 이상, 최적 하한 12 미만
    const common = { exercise: bench, plannedSets: 3, weekly, recovery: fullRecovery(), readiness: 80, deload: false, hasHistory: true };
    expect(adjustSets({ ...common, mesoWeek: 1 }).sets).toBe(3);
    const w2 = adjustSets({ ...common, mesoWeek: 2 });
    expect(w2.sets).toBe(4);
    expect(w2.reasons[0]!.text).toContain('2주차');
    // 1주차는 MEV 미만이어도 계획 유지
    expect(adjustSets({ ...common, weekly: emptyMuscleMap(), mesoWeek: 1 }).sets).toBe(3);
  });
  it('MRV 초과 시 감소, 디로딩 시 절반', () => {
    const r = adjustSets({ exercise: bench, plannedSets: 3, weekly: { ...emptyMuscleMap(), chest: 30 }, recovery: fullRecovery(), readiness: 80, deload: false });
    expect(r.sets).toBe(2);
    expect(adjustSets({ exercise: bench, plannedSets: 5, weekly: emptyMuscleMap(), recovery: fullRecovery(), readiness: 80, deload: true }).sets).toBe(3);
  });
});

describe('analysis', () => {
  const mk = (i: number, w: number): ExerciseSession => ({
    sessionId: i,
    date: T0 + i * DAY_MS,
    sets: session(i, T0 + i * DAY_MS, 'bench_press', [[w, 8, 2]]),
  });

  it('정체 감지', () => {
    expect(detectPlateau([mk(1, 100), mk(2, 102.5), mk(3, 105), mk(4, 107.5)]).plateau).toBe(false);
    const stuck = detectPlateau([mk(1, 100), mk(2, 105), mk(3, 105), mk(4, 102.5), mk(5, 105)]);
    expect(stuck.plateau).toBe(true);
    expect(stuck.sessionsSincePR).toBe(3);
    expect(detectPlateau([]).plateau).toBe(false);
  });

  it('디로딩 권고: 계획된 주 / 수행 하락 / 컨디션 저하 단독은 권고 안 함', () => {
    const program = { mesoStart: T0 - 4 * WEEK_MS, mesoWeeks: 4 } as Program;
    expect(deloadAdvice({ program, sets: [], checkins: [], now: T0 + DAY_MS }).scheduled).toBe(true);

    const sets = [
      ...session(1, T0 - 7 * DAY_MS, 'bench_press', [[100, 8, 2]]),
      ...session(2, T0 - 2 * DAY_MS, 'bench_press', [[90, 8, 2]]),
      ...session(1, T0 - 7 * DAY_MS, 'squat', [[140, 8, 2]]),
      ...session(2, T0 - 2 * DAY_MS, 'squat', [[120, 8, 2]]),
    ];
    const byDrop = deloadAdvice({ sets, checkins: [], now: T0 });
    expect(byDrop.recommend).toBe(true);
    expect(byDrop.scheduled).toBe(false);

    const bad: Checkin[] = [1, 2, 3].map((d) => ({ date: T0 - d * DAY_MS, sleep: 1, soreness: 2, motivation: 2, stress: 1 }));
    const tired = deloadAdvice({ sets: [], checkins: bad, now: T0 });
    expect(tired.signals).toHaveLength(1);
    expect(tired.recommend).toBe(false);
  });
});

describe('defaultRepRange — 근비대 중심 반복 범위 (Schoenfeld 2021)', () => {
  it.each([
    ['bench_press', [6, 10]], // 바벨 복합
    ['deadlift', [6, 8]], // 고피로 복합도 6회 이상
    ['machine_chest_press', [8, 12]], // 머신·덤벨 복합
    ['db_bench', [8, 12]],
    ['triceps_pushdown', [10, 15]], // 고립
    ['lateral_raise', [12, 20]], // 소근육 고반복
  ] as const)('%s → %j', (id, range) => {
    expect(defaultRepRange(getExercise(id)!)).toEqual(range);
  });
});

describe('splits', () => {
  it('근비대 템플릿: 햄스트링은 시티드 레그 컬(신장 위치) 우선 (Maeo 2021)', () => {
    const p = generateProgram({ daysPerWeek: 4, sessionMinutes: 90, priorities: [], now: T0, splitId: 'upper_lower' });
    const ids = p.days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
    expect(ids).toContain('seated_leg_curl');
    expect(ids).not.toContain('lying_leg_curl');
  });

  it('운동 일수별 추천 분할', () => {
    expect(recommendSplit(2)).toBe('full_body');
    expect(recommendSplit(3)).toBe('full_body');
    expect(recommendSplit(4)).toBe('upper_lower');
    expect(recommendSplit(5)).toBe('upper_lower_ppl');
    expect(recommendSplit(6)).toBe('ppl');
  });

  it.each([2, 3, 4, 5, 6])('주 %i일 루틴: 시간 예산 준수, 큰 근육 볼륨 확보', (days) => {
    const p = generateProgram({ daysPerWeek: days, sessionMinutes: 75, priorities: [], now: T0 });
    expect(p.days.length).toBeGreaterThanOrEqual(2);
    for (const d of p.days) expect(dayDurationMin(d)).toBeLessThanOrEqual(75);
    const vol = programWeeklyVolume(p.days, days);
    // 주 2일은 총 시간이 부족해 모든 부위 목표를 채울 수 없음 → 하한 완화
    const floor = days === 2 ? 4 : 6;
    for (const m of ['chest', 'lats', 'quads'] as const) expect(vol[m]).toBeGreaterThanOrEqual(floor);
  });

  it('브로 분할도 생성 가능', () => {
    const p = generateProgram({ daysPerWeek: 5, sessionMinutes: 75, priorities: [], now: T0, splitId: 'bro' });
    expect(p.days).toHaveLength(5);
  });

  it('우선 부위는 더 많은 볼륨', () => {
    const a = generateProgram({ daysPerWeek: 4, sessionMinutes: 90, priorities: [], now: T0 });
    const b = generateProgram({ daysPerWeek: 4, sessionMinutes: 90, priorities: ['side_delts'], now: T0 });
    expect(programWeeklyVolume(b.days).side_delts).toBeGreaterThan(programWeeklyVolume(a.days).side_delts);
  });

  it('짧은 세션은 종목 수를 줄임', () => {
    const p = generateProgram({ daysPerWeek: 3, sessionMinutes: 35, priorities: [], now: T0 });
    for (const d of p.days) expect(d.exercises.length).toBeLessThan(6);
  });

  it('다음 수행할 day 순환', () => {
    const p = { ...generateProgram({ daysPerWeek: 4, sessionMinutes: 75, priorities: [], now: T0, splitId: 'upper_lower' }), id: 1 };
    expect(nextProgramDay(p, [])!.id).toBe(p.days[0]!.id);
    const sessions = [
      { id: 1, startedAt: T0, endedAt: T0 + H, programId: 1, dayId: p.days[0]!.id },
      { id: 2, startedAt: T0 + DAY_MS, endedAt: T0 + DAY_MS + H, programId: 1, dayId: p.days[3]!.id },
    ];
    expect(nextProgramDay(p, sessions)!.id).toBe(p.days[0]!.id);
    expect(nextProgramDay(p, sessions.slice(0, 1))!.id).toBe(p.days[1]!.id);
  });
});

describe('suggestNext — 가져온 루틴의 시작 무게', () => {
  it('기록이 없어도 startWeight 가 있으면 그 무게·반복으로 처방', async () => {
    const { suggestNext } = await import('./progression');
    const { getExercise } = await import('../domain/exercises');
    const s = suggestNext({ exercise: getExercise('bench_press')!, history: [], repMin: 6, repMax: 10, targetRir: 2, plannedSets: 4, startWeight: 50, startReps: 9 });
    expect(s).toMatchObject({ action: 'start', weight: 50, repsTarget: 9 });
    expect(s.reasons[0]!.text).toContain('가져온 루틴');
  });
});
