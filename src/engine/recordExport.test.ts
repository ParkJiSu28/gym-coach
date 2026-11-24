import { describe, expect, it } from 'vitest';
import type { Program, SetLog, WorkoutSession } from '../domain/types';
import { exportText, routineKey, routineOptions, sessionsFor } from './recordExport';

const prog: Program = {
  id: 1, name: 'p', splitId: 'upper_lower', createdAt: 0, active: true, mesoStart: 0, mesoWeeks: 4, priorities: [],
  days: [
    { id: 'a', name: '상체A', exercises: [{ exerciseId: 'bench_press', sets: 3, repMin: 6, repMax: 10, restSec: 150 }] },
    { id: 'b', name: '하체A', exercises: [{ exerciseId: 'squat', sets: 3, repMin: 6, repMax: 10, restSec: 180 }] },
  ],
} as Program;
const D = (d: number) => new Date(2026, 10, d, 18, 0).getTime();
const sessions: WorkoutSession[] = [
  { id: 1, startedAt: D(10), endedAt: D(10) + 50 * 60_000, programId: 1, dayId: 'a' },
  { id: 2, startedAt: D(12), endedAt: D(12) + 40 * 60_000, programId: 1, dayId: 'b' },
  { id: 3, startedAt: D(14), endedAt: D(14) + 45 * 60_000, programId: 1, dayId: 'a' },
  { id: 4, startedAt: D(15), manual: true },
  { id: 5, startedAt: D(16), programId: 1, dayId: 'b' }, // 세트 없음
];
const set = (id: number, sessionId: number, exerciseId: string, weight: number, reps: number, extra: Partial<SetLog> = {}): SetLog => ({
  id, sessionId, exerciseId, order: id, weight, reps, rir: 2, rirEstimated: false, warmup: false, completedAt: D(10) + id * 1000, ...extra,
});
const sets: SetLog[] = [
  set(1, 1, 'bench_press', 60, 8),
  set(2, 1, 'bench_press', 60, 7, { restSec: 150 }),
  set(3, 2, 'squat', 80, 6),
  set(4, 3, 'bench_press', 20, 10, { warmup: true }),
  set(5, 3, 'bench_press', 62.5, 8, { rirEstimated: true, rir: 3 }),
  set(6, 4, 'lat_pulldown', 50, 10),
];

describe('루틴·날짜 골라 기록 내려받기', () => {
  it('세트가 있는 세션만으로 루틴 목록과 횟수', () => {
    expect(routineOptions([prog], sessions, sets)).toEqual([
      { key: '1:a', label: '상체A', count: 2 },
      { key: '1:b', label: '하체A', count: 1 },
      { key: 'manual', label: '직접 입력 기록', count: 1 },
    ]);
    expect(routineKey(sessions[3]!)).toBe('manual');
  });
  it('고른 루틴의 수행 날짜를 최신순으로', () => {
    expect(sessionsFor(['1:a'], sessions, sets).map((s) => s.id)).toEqual([3, 1]);
    expect(sessionsFor(['1:a', '1:b'], sessions, sets).map((s) => s.id)).toEqual([3, 2, 1]);
  });
  it('텍스트: 날짜순으로 루틴명·종목·계획·세트 무게 횟수 RIR 휴식', () => {
    const t = exportText([1, 3], { programs: [prog], sessions, sets });
    expect(t.indexOf('11/10')).toBeLessThan(t.indexOf('11/14'));
    expect(t).toContain('상체A');
    expect(t).toContain('바벨 벤치프레스 (계획 3세트 6-10회, 휴식 150초)');
    expect(t).toContain('1세트 60kg×8회 RIR 2');
    expect(t).toContain('2세트 60kg×7회 RIR 2 휴식 2:30');
    expect(t).toContain('W 20kg×10회');
    expect(t).toContain('RIR 3(추정)');
    expect(t).not.toContain('바벨 백스쿼트');
  });
});
