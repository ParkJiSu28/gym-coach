import { describe, expect, it } from 'vitest';
import { DEFAULT_UNKNOWN_RIR, ManualRecordError, manualSetTimes, validateManualEntry, type ManualEntry } from './records';
import { DAY_MS } from './volume';

// 2026-03-10 15:00 (로컬 시각 기준으로 계산)
const NOW = new Date(2026, 2, 10, 15, 0, 0).getTime();
const TODAY = new Date(2026, 2, 10).getTime();

const entry = (over: Partial<ManualEntry> = {}): ManualEntry => ({
  date: TODAY - 3 * DAY_MS,
  exerciseId: 'bench_press',
  sets: [
    { weight: 80, reps: 8 },
    { weight: 80, reps: 7 },
    { weight: 75, reps: 8 },
  ],
  ...over,
});

describe('validateManualEntry — 다른 앱 기록을 손으로 옮겨 적기', () => {
  it('세트마다 다른 무게·반복을 그대로 보존', () => {
    const v = validateManualEntry(entry(), NOW);
    expect(v.sets.map((s) => [s.weight, s.reps])).toEqual([
      [80, 8],
      [80, 7],
      [75, 8],
    ]);
  });

  it('RIR 을 모르면 기본값으로 채우고 "추정"으로 표시', () => {
    const v = validateManualEntry(entry(), NOW);
    expect(v.sets.every((s) => s.rir === DEFAULT_UNKNOWN_RIR && s.rirEstimated)).toBe(true);
  });

  it('RIR 을 입력하면 그 값을 쓰고 추정 아님', () => {
    const v = validateManualEntry(entry({ sets: [{ weight: 80, reps: 8, rir: 1 }, { weight: 80, reps: 8, rir: null }] }), NOW);
    expect(v.sets[0]).toMatchObject({ rir: 1, rirEstimated: false });
    expect(v.sets[1]).toMatchObject({ rir: DEFAULT_UNKNOWN_RIR, rirEstimated: true });
  });

  it('오늘 날짜 허용, 미래 날짜 거부', () => {
    expect(() => validateManualEntry(entry({ date: TODAY }), NOW)).not.toThrow();
    expect(() => validateManualEntry(entry({ date: TODAY + DAY_MS }), NOW)).toThrow(ManualRecordError);
    expect(() => validateManualEntry(entry({ date: TODAY + DAY_MS }), NOW)).toThrow(/미래/);
  });

  it('알 수 없는 종목 거부', () => {
    expect(() => validateManualEntry(entry({ exerciseId: 'nope' }), NOW)).toThrow(/종목/);
  });

  it('세트가 없으면 거부, 20세트 초과 거부', () => {
    expect(() => validateManualEntry(entry({ sets: [] }), NOW)).toThrow(/세트/);
    expect(() => validateManualEntry(entry({ sets: Array(21).fill({ weight: 50, reps: 5 }) }), NOW)).toThrow(/세트/);
  });

  it.each([
    ['음수 무게', { weight: -1, reps: 8 }, /무게/],
    ['NaN 무게', { weight: Number.NaN, reps: 8 }, /무게/],
    ['과도한 무게', { weight: 1001, reps: 8 }, /무게/],
    ['반복 0회', { weight: 50, reps: 0 }, /반복/],
    ['소수 반복', { weight: 50, reps: 2.5 }, /반복/],
    ['반복 101회', { weight: 50, reps: 101 }, /반복/],
    ['RIR 음수', { weight: 50, reps: 8, rir: -1 }, /RIR/],
    ['RIR 11', { weight: 50, reps: 8, rir: 11 }, /RIR/],
  ])('%s 거부 — 몇 번째 세트인지 알려줌', (_label, bad, msg) => {
    const sets = [{ weight: 50, reps: 8 }, bad];
    expect(() => validateManualEntry(entry({ sets }), NOW)).toThrow(msg);
    expect(() => validateManualEntry(entry({ sets }), NOW)).toThrow(/2번째 세트/);
  });

  it('맨몸 운동은 무게 0 허용', () => {
    expect(() => validateManualEntry(entry({ exerciseId: 'push_up', sets: [{ weight: 0, reps: 20 }] }), NOW)).not.toThrow();
  });
});

describe('manualSetTimes — 직접 입력 세트의 시각', () => {
  it('과거 날짜는 그날 정오부터 3분 간격', () => {
    const day = TODAY - 3 * DAY_MS;
    const t = manualSetTimes(day, 3, NOW);
    expect(t).toHaveLength(3);
    expect(new Date(t[0]!).getHours()).toBe(12);
    expect(t[1]! - t[0]!).toBe(180_000);
    expect(new Date(t[2]!).getDate()).toBe(new Date(day).getDate());
  });

  it('오늘 날짜는 현재 시각 이전에 끝나도록 배치 (미래 세트 없음)', () => {
    const t = manualSetTimes(TODAY, 4, NOW);
    expect(t).toHaveLength(4);
    expect(Math.max(...t)).toBeLessThanOrEqual(NOW);
    expect(new Date(t[0]!).getDate()).toBe(10);
  });

  it('하루 중간 시각이 들어와도 그 날짜로 정규화', () => {
    const t = manualSetTimes(TODAY - 2 * DAY_MS + 5 * 60 * 60 * 1000, 1, NOW);
    expect(new Date(t[0]!).getDate()).toBe(8);
    expect(new Date(t[0]!).getHours()).toBe(12);
  });

  it('같은 날 이미 입력한 세트 뒤에 이어서 배치 (offset)', () => {
    const day = TODAY - DAY_MS;
    const first = manualSetTimes(day, 2, NOW);
    const next = manualSetTimes(day, 2, NOW, 2);
    expect(next[0]).toBe(first[1]! + 180_000);
  });
});
