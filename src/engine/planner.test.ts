import { describe, expect, it } from 'vitest';
import type { SetLog } from '../domain/types';
import { buildContext, planDay, planExercise } from './planner';
import { generateProgram } from './splits';
import { DAY_MS, WEEK_MS } from './volume';

const T0 = Date.UTC(2026, 0, 5, 10);

const benchSession = (sessionId: number, at: number, reps: number): SetLog[] =>
  [0, 1, 2].map((i) => ({ id: sessionId * 10 + i, sessionId, exerciseId: 'bench_press', order: i, weight: 80, reps, rir: 2, completedAt: at + i * 180_000 }));

describe('planner', () => {
  it('프로그램 없이도 기본 반복 범위로 처방', () => {
    const ctx = buildContext({ now: T0, sets: benchSession(1, T0 - 3 * DAY_MS, 8), checkins: [] });
    const p = planExercise(ctx, 'bench_press')!;
    expect(p.repMin).toBe(6);
    expect(p.suggestion.weight).toBe(80);
    expect(planExercise(ctx, 'does_not_exist')).toBeNull();
  });

  it('진행 중인 세션은 이력에서 제외', () => {
    const sets = [...benchSession(1, T0 - 3 * DAY_MS, 8), ...benchSession(2, T0 - 60_000, 10)];
    const ctx = buildContext({ now: T0, sets, checkins: [], excludeSessionId: 2 });
    expect(planExercise(ctx, 'bench_press')!.suggestion.action).toBe('add_reps');
  });

  it('프로그램 day 계획 + 메소 주차 RIR 근거 포함', () => {
    const program = { ...generateProgram({ daysPerWeek: 4, sessionMinutes: 75, priorities: [], now: T0 }), id: 1 };
    const ctx = buildContext({ now: T0 + WEEK_MS, sets: [], checkins: [{ date: T0 + WEEK_MS - 1000, sleep: 5, soreness: 5, motivation: 5, stress: 5 }], program });
    expect(ctx.readiness).toBe(100);
    const plan = planDay(ctx, program.days[0]!);
    expect(plan.length).toBe(program.days[0]!.exercises.length);
    expect(plan[0]!.reasons.some((r) => r.text.includes('2/4주차'))).toBe(true);
  });

  it('디로딩 주에는 세트 절반', () => {
    const program = { ...generateProgram({ daysPerWeek: 4, sessionMinutes: 75, priorities: [], now: T0 }), id: 1 };
    const sets = benchSession(1, T0 + 4 * WEEK_MS - DAY_MS, 8);
    const ctx = buildContext({ now: T0 + 4 * WEEK_MS + DAY_MS, sets, checkins: [], program });
    expect(ctx.deload).toBe(true);
    const p = planExercise(ctx, 'bench_press', { exerciseId: 'bench_press', sets: 4, repMin: 6, repMax: 10, restSec: 150 })!;
    expect(p.suggestion.action).toBe('deload');
    expect(p.suggestion.sets).toBe(2);
  });
});
