import { describe, expect, it } from 'vitest';
import type { Program } from '../domain/types';
import { applyOrder, moveId, moveIndex, moveInDay, parseNumDraft, setDayRest } from './sessionEdit';

const prog = (): Program =>
  ({
    name: 'x', splitId: 'upper_lower', createdAt: 0, active: true, mesoStart: 0, mesoWeeks: 4, priorities: [],
    days: [{ id: 'a', name: '상체A', exercises: [
      { exerciseId: 'bench_press', sets: 4, repMin: 6, repMax: 10, restSec: 150 },
      { exerciseId: 'lat_pulldown', sets: 3, repMin: 8, repMax: 12, restSec: 120 },
      { exerciseId: 'lateral_raise', sets: 3, repMin: 12, repMax: 20, restSec: 90 },
    ] }],
  }) as Program;

describe('운동 순서 바꾸기', () => {
  it('moveId: 위/아래로 한 칸, 끝에서는 그대로', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });
  it('applyOrder: 저장된 순서 먼저, 새로 생긴 종목은 뒤에 원래 순서대로', () => {
    expect(applyOrder(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'a', 'b', 'd']);
    expect(applyOrder(['a', 'b'], undefined)).toEqual(['a', 'b']);
    expect(applyOrder(['a', 'b'], ['z', 'b'])).toEqual(['b', 'a']);
  });
  it('moveInDay: 루틴의 날 안에서 종목 순서 이동 (원본 불변)', () => {
    const p = prog();
    const next = moveInDay(p, 'a', 2, -1);
    expect(next.days[0]!.exercises.map((e) => e.exerciseId)).toEqual(['bench_press', 'lateral_raise', 'lat_pulldown']);
    expect(p.days[0]!.exercises[1]!.exerciseId).toBe('lat_pulldown');
  });
});

describe('종목별 휴식 시간', () => {
  it('setDayRest: 그 종목만 휴식이 바뀌고 30초~10분으로 제한', () => {
    const p = setDayRest(prog(), 'a', 'lat_pulldown', 75);
    expect(p.days[0]!.exercises.map((e) => e.restSec)).toEqual([150, 75, 90]);
    expect(setDayRest(prog(), 'a', 'bench_press', 5).days[0]!.exercises[0]!.restSec).toBe(30);
    expect(setDayRest(prog(), 'a', 'bench_press', 9999).days[0]!.exercises[0]!.restSec).toBe(600);
  });
});

describe('숫자 칸 입력', () => {
  it('비우면 null (0 으로 다시 채우지 않음), 숫자는 숫자로', () => {
    expect(parseNumDraft('')).toBeNull();
    expect(parseNumDraft('0')).toBe(0);
    expect(parseNumDraft('62.5')).toBe(62.5);
    expect(parseNumDraft('62.')).toBe(62);
    expect(parseNumDraft('abc')).toBeNull();
  });
});

describe('끌어서 순서 바꾸기', () => {
  it('moveIndex: 한 번에 원하는 위치로', () => {
    expect(moveIndex(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveIndex(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveIndex(['a', 'b', 'c', 'd'], 1, 2)).toEqual(['a', 'c', 'b', 'd']);
  });
  it('범위 밖이거나 같은 위치면 그대로', () => {
    expect(moveIndex(['a', 'b'], 0, 0)).toEqual(['a', 'b']);
    expect(moveIndex(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
    expect(moveIndex(['a', 'b'], -1, 1)).toEqual(['a', 'b']);
  });
});
