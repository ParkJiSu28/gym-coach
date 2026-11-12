import { describe, expect, it } from 'vitest';
import { scheduledDayFor, scheduleWarnings, sortWeekdays, upcomingSessions, weekdayPlan } from './schedule';
import { generateProgram } from './splits';
import { DAY_MS } from './volume';

// 2026-03-09 = 월요일
const MON = new Date(2026, 2, 9, 9).getTime();
const at = (offsetDays: number) => MON + offsetDays * DAY_MS;

const program = (weekdays: number[], splitId?: Parameters<typeof generateProgram>[0]['splitId']) => ({
  ...generateProgram({ daysPerWeek: weekdays.length, sessionMinutes: 70, priorities: [], now: MON, splitId, weekdays }),
  id: 1,
});

describe('sortWeekdays — 월요일부터 정렬, 중복 제거', () => {
  it('일요일(0)은 맨 뒤', () => {
    expect(sortWeekdays([0, 3, 1, 3, 5])).toEqual([1, 3, 5, 0]);
  });
  it('범위 밖 값은 제거', () => {
    expect(sortWeekdays([1, 7, -1, 2])).toEqual([1, 2]);
  });
});

describe('운동 가능 요일 → 프로그램', () => {
  it('선택한 요일 수만큼 day 를 만들고 요일을 저장', () => {
    const p = program([1, 3, 5]);
    expect(p.days).toHaveLength(3);
    expect(p.weekdays).toEqual([1, 3, 5]);
    expect(p.splitId).toBe('full_body');
  });

  it('요일 4개 → 상·하체, 요일 순서대로 상체A·하체A·상체B·하체B', () => {
    const p = program([1, 2, 4, 5]);
    expect(p.splitId).toBe('upper_lower');
    expect(weekdayPlan(p).map((x) => [x.weekday, x.day.name])).toEqual([
      [1, '상체 A'],
      [2, '하체 A'],
      [4, '상체 B'],
      [5, '하체 B'],
    ]);
  });

  it('오늘이 운동 요일이면 그날 세션, 아니면 휴식(null)', () => {
    const p = program([1, 3, 5]);
    expect(scheduledDayFor(p, at(0))?.name).toBe('전신 A'); // 월
    expect(scheduledDayFor(p, at(1))).toBeNull(); // 화
    expect(scheduledDayFor(p, at(2))?.name).toBe('전신 B'); // 수
    expect(scheduledDayFor(p, at(4))?.name).toBe('전신 C'); // 금
    expect(scheduledDayFor(p, at(7))?.name).toBe('전신 A'); // 다음 주 월
  });

  it('요일 설정이 없는 예전 프로그램은 undefined (순환 방식 유지)', () => {
    const { weekdays: _w, ...legacy } = program([1, 3, 5]);
    void _w;
    expect(scheduledDayFor(legacy, at(0))).toBeUndefined();
  });

  it('다가오는 세션 목록 (오늘 포함)', () => {
    const p = program([1, 3, 5]);
    const up = upcomingSessions(p, at(1), 3); // 화요일부터
    expect(up.map((u) => new Date(u.date).getDay())).toEqual([3, 5, 1]);
    expect(up.map((u) => u.day.name)).toEqual(['전신 B', '전신 C', '전신 A']);
  });
});

describe('scheduleWarnings — 회복 관점 경고', () => {
  it('전신 운동을 연속 이틀 하면 경고', () => {
    const w = scheduleWarnings('full_body', [1, 2, 4]);
    expect(w).toHaveLength(1);
    expect(w[0]!.text).toMatch(/연속/);
  });
  it('하루씩 띄우면 경고 없음', () => {
    expect(scheduleWarnings('full_body', [1, 3, 5])).toEqual([]);
  });
  it('일요일-월요일도 연속으로 판단', () => {
    expect(scheduleWarnings('full_body', [0, 1, 4])).toHaveLength(1);
  });
  it('주 7일은 휴식일이 없다고 경고', () => {
    expect(scheduleWarnings('ppl', [0, 1, 2, 3, 4, 5, 6]).some((r) => /휴식/.test(r.text))).toBe(true);
  });
});
