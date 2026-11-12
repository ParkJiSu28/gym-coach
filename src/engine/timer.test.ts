import { describe, expect, it } from 'vitest';
import { adjustRestTarget, restStatus } from './timer';

describe('restStatus — 휴식 타이머 상태', () => {
  it('남은 시간과 진행률', () => {
    expect(restStatus(30, 120)).toEqual({ remainingSec: 90, done: false, progress: 0.25 });
  });
  it('목표 도달 시 done, 남은 시간 0, 진행률 1로 고정', () => {
    expect(restStatus(150, 120)).toEqual({ remainingSec: 0, done: true, progress: 1 });
  });
  it('음수 경과는 0으로', () => {
    expect(restStatus(-5, 60).remainingSec).toBe(60);
  });
});

describe('adjustRestTarget — ±15초 조절', () => {
  it('증감', () => {
    expect(adjustRestTarget(120, 15)).toBe(135);
    expect(adjustRestTarget(120, -15)).toBe(105);
  });
  it('30초~10분으로 제한', () => {
    expect(adjustRestTarget(30, -15)).toBe(30);
    expect(adjustRestTarget(600, 15)).toBe(600);
  });
});
