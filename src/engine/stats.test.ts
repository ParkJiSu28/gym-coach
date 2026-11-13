import { describe, expect, it } from 'vitest';
import type { SetLog } from '../domain/types';
import { exerciseProgress, weeklySummary } from './stats';

const NOW = new Date(2026, 10, 13, 20).getTime();
const DAY = 86_400_000;
const s = (daysAgo: number, exerciseId: string, weight: number, reps: number, sessionId = daysAgo): SetLog => ({
  sessionId,
  exerciseId,
  order: 0,
  weight,
  reps,
  rir: 2,
  completedAt: NOW - daysAgo * DAY,
});
const sets = [s(1, 'bench_press', 60, 8), s(1, 'bench_press', 60, 7), s(3, 'squat', 100, 5), s(15, 'bench_press', 55, 8), s(30, 'bench_press', 50, 8)];

describe('weeklySummary', () => {
  const w = weeklySummary(sets, NOW, 8);
  it('최근 8주, 최신 주가 마지막', () => {
    expect(w).toHaveLength(8);
    expect(w.at(-1)).toMatchObject({ sessions: 2, sets: 3, tonnage: 60 * 8 + 60 * 7 + 100 * 5 });
  });
  it('주마다 부위별 세트', () => {
    expect(w.at(-1)!.muscles.chest).toBe(2);
    expect(w.at(-3)!.muscles.chest).toBe(1);
  });
  it('기록 없는 주는 0', () => {
    expect(w[0]).toMatchObject({ sessions: 0, sets: 0, tonnage: 0 });
  });
});

describe('exerciseProgress', () => {
  const p = exerciseProgress(sets, NOW);
  it('종목별 첫·최근 최고 세트와 추정 1RM 변화(%)', () => {
    const bench = p.find((x) => x.exerciseId === 'bench_press')!;
    expect(bench).toMatchObject({ sessions: 3, first: { weight: 50, reps: 8 }, last: { weight: 60, reps: 8 } });
    expect(bench.changePct).toBeCloseTo(20, 0);
  });
  it('최근에 한 종목 먼저', () => {
    expect(p[0]!.exerciseId).toBe('bench_press');
  });
  it('워밍업은 제외', () => {
    const q = exerciseProgress([...sets, { ...s(1, 'squat', 20, 10), warmup: true }], NOW);
    expect(q.find((x) => x.exerciseId === 'squat')!.last).toMatchObject({ weight: 100 });
  });
});
