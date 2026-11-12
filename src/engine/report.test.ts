import { describe, expect, it } from 'vitest';
import type { SetLog } from '../domain/types';
import { buildReport } from './report';
import { DAY_MS } from './volume';

const NOW = Date.UTC(2026, 2, 10, 15);
let id = 1;
function rec(exerciseId: string, daysAgo: number, reps: number, n: number, extra: Partial<SetLog> = {}): SetLog[] {
  const base = NOW - daysAgo * DAY_MS;
  return Array.from({ length: n }, (_, i) => ({
    id: id++,
    sessionId: 100 + daysAgo,
    exerciseId,
    order: i,
    weight: 50,
    reps,
    rir: 2,
    completedAt: base + i * 180_000,
    ...extra,
  }));
}

describe('buildReport — 논문 기준 분석 리포트', () => {
  it('기록이 없으면 hasData=false', () => {
    const r = buildReport({ sets: [], now: NOW });
    expect(r.hasData).toBe(false);
    expect(r.muscles).toEqual([]);
  });

  it('부위별 현재 볼륨 → 논문 범위 → 할 일 (부족)', () => {
    const r = buildReport({ sets: rec('lateral_raise', 2, 15, 4), now: NOW });
    const side = r.muscles.find((m) => m.muscle === 'side_delts')!;
    expect(side.weeklySets).toBe(4);
    expect(side.status).toBe('below_mev');
    expect(side.action.text).toMatch(/\+\d+세트/);
    expect(side.action.citations).toContain('schoenfeld2017volume');
  });

  it('최적 범위면 유지 권고', () => {
    const sets = [...rec('bench_press', 1, 8, 7), ...rec('bench_press', 4, 8, 7)];
    const chest = buildReport({ sets, now: NOW }).muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.status).toBe('optimal');
    expect(chest.action.text).toMatch(/유지/);
  });

  it('주 1회만 훈련하면 빈도 2회로 나누라는 권고', () => {
    const chest = buildReport({ sets: rec('bench_press', 1, 8, 14), now: NOW }).muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.frequency).toBe(1);
    expect(chest.action.text).toMatch(/주 2회/);
    expect(chest.action.citations).toContain('schoenfeld2016freq');
  });

  it('문제 있는 부위가 먼저 정렬', () => {
    const sets = [...rec('bench_press', 1, 8, 7), ...rec('bench_press', 4, 8, 7), ...rec('lateral_raise', 2, 15, 2)];
    const r = buildReport({ sets, now: NOW });
    expect(r.muscles[0]!.status).not.toBe('optimal');
  });

  it('저반복(6회 미만) 비중이 높으면 근비대용 반복 범위 팁', () => {
    const r = buildReport({ sets: rec('squat', 1, 3, 10), now: NOW });
    expect(r.tips.some((t) => t.citations.includes('schoenfeld2021continuum'))).toBe(true);
  });

  it('평균 휴식이 짧으면 휴식 팁', () => {
    const sets = rec('bench_press', 1, 10, 6).map((s, i) => (i ? { ...s, restSec: 50 } : s));
    expect(buildReport({ sets, now: NOW }).tips.some((t) => t.citations.includes('singer2024'))).toBe(true);
  });

  it('RIR 을 대부분 추정값으로 기록했으면 RIR 기록 팁', () => {
    const sets = rec('bench_press', 1, 8, 6, { rirEstimated: true });
    expect(buildReport({ sets, now: NOW }).tips.some((t) => t.citations.includes('halperin2022'))).toBe(true);
  });

  it('한 부위를 한 종목으로만 오래 했으면 종목 다양화 팁', () => {
    const sets = [1, 5, 9, 13].flatMap((d) => rec('bench_press', d, 8, 4));
    expect(buildReport({ sets, now: NOW }).tips.some((t) => t.citations.includes('kassiano2022'))).toBe(true);
  });

  it('라잉 레그 컬만 했으면 시티드 레그 컬(신장 위치) 팁', () => {
    const sets = rec('lying_leg_curl', 1, 12, 4);
    expect(buildReport({ sets, now: NOW }).tips.some((t) => t.citations.includes('maeo2021'))).toBe(true);
  });

  it('워밍업과 RIR 5 이상은 분석에서 제외', () => {
    const sets = [...rec('squat', 1, 3, 10, { warmup: true }), ...rec('squat', 1, 3, 10, { rir: 6 })];
    expect(buildReport({ sets, now: NOW }).hasData).toBe(false);
  });
});
