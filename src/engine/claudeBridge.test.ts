import { describe, expect, it } from 'vitest';
import type { Program, SetLog, WorkoutSession } from '../domain/types';
import { buildClaudePrompt, parseRoutinePlan, planToProgram } from './claudeBridge';

const NOW = new Date(2026, 10, 13, 20).getTime();
const at = (d: number, h = 19) => new Date(2026, 10, d, h).getTime();
let sid = 0;
function day(d: number, rows: [string, number, number][]): { session: WorkoutSession; sets: SetLog[] } {
  const id = ++sid;
  return {
    session: { id, startedAt: at(d), endedAt: at(d, 20), manual: true },
    sets: rows.map(([exerciseId, weight, reps], i) => ({ id: id * 100 + i, sessionId: id, exerciseId, order: i, weight, reps, rir: 2, rirEstimated: true, completedAt: at(d) + i * 60_000 })),
  };
}
const data = [
  day(3, [['bench_press', 50, 8], ['bench_press', 50, 8], ['lat_pulldown', 50, 10]]),
  day(10, [['bench_press', 52.5, 8], ['bench_press', 52.5, 7], ['squat', 80, 8]]),
];
const sessions = data.map((d) => d.session);
const sets = data.flatMap((d) => d.sets);

describe('buildClaudePrompt — Claude 에 붙여넣을 내 기록', () => {
  const text = buildClaudePrompt({ sessions, sets, now: NOW });
  it('날짜별 기록을 종목·무게×반복으로', () => {
    expect(text).toContain('11/10');
    expect(text).toContain('바벨 벤치프레스 52.5×8, 52.5×7');
  });
  it('종목별 추이와 부위별 주간 세트', () => {
    expect(text).toMatch(/바벨 벤치프레스: .*50.*→.*52\.5/);
    expect(text).toContain('가슴');
  });
  it('답변 형식(앱이 읽는 형식)과 근비대 조건을 요청', () => {
    expect(text).toContain('### ');
    expect(text).toContain('| 4세트 | 6-10회 |');
    expect(text).toMatch(/근비대/);
  });
  it('시간·집중 부위·빼고 싶은 종목·주당 일수를 넣으면 조건에 포함', () => {
    const t = buildClaudePrompt({ sessions, sets, now: NOW, maxMinutes: 70, priorities: ['side_delts'], avoid: ['ohp'], daysPerWeek: 4 });
    expect(t).toContain('70분');
    expect(t).toContain('측면 삼각근');
    expect(t).toContain('오버헤드 프레스');
    expect(t).toContain('주 4일');
  });
  it('현재 루틴이 있으면 함께 보냄', () => {
    const p = {
      name: 'x', splitId: 'upper_lower', createdAt: 0, active: true, mesoStart: 0, mesoWeeks: 4, priorities: [],
      days: [{ id: 'a', name: '상체A', exercises: [{ exerciseId: 'bench_press', sets: 4, repMin: 6, repMax: 10, restSec: 150 }] }],
    } as Program;
    expect(buildClaudePrompt({ sessions, sets, now: NOW, program: p })).toContain('상체A: 바벨 벤치프레스 4세트');
  });
  it('기록이 없어도 만들어짐', () => {
    expect(buildClaudePrompt({ sessions: [], sets: [], now: NOW })).toContain('기록 없음');
  });
});

const ANSWER = [
  '좋습니다. 근비대 루틴입니다.',
  '',
  '### 상체A',
  '- 바벨 벤치프레스 | 4세트 | 6-10회 | 55kg | 휴식 150초',
  '- 랫풀다운 | 3세트 | 8-12회 | 50kg | 휴식 2분',
  '- 사이드 레터럴 레이즈 | 4세트 | 12-20회 | 8kg | 휴식 90초',
  '',
  '### 하체A',
  '1. 스쿼트 4세트 6~10회 80kg 휴식 3분',
  '2. 시티드 레그컬 | 3세트 | 10-15회',
  '3. 이상한운동 | 3세트 | 10회',
  '',
  '**하체B**',
  '| 종목 | 세트 | 반복 | 무게 | 휴식 |',
  '|---|---|---|---|---|',
  '| 루마니안 데드리프트 | 3 | 8-10 | 60kg | 150초 |',
  '| 레그 익스텐션 | 3세트 | 12-15회 | 45kg | 90초 |',
  '',
  '주의: 첫 주는 RIR 2~3으로.',
].join('\n');

describe('parseRoutinePlan — Claude 답변 읽기', () => {
  const plan = parseRoutinePlan(ANSWER);
  it('루틴(날) 나누기: ### / **굵게** 제목', () => {
    expect(plan.days.map((d) => d.name)).toEqual(['상체A', '하체A', '하체B']);
  });
  it('종목·세트·반복 범위·무게·휴식', () => {
    expect(plan.days[0]!.items[0]).toMatchObject({ exerciseId: 'bench_press', sets: 4, repMin: 6, repMax: 10, weight: 55, restSec: 150 });
    expect(plan.days[0]!.items[1]).toMatchObject({ exerciseId: 'lat_pulldown', sets: 3, repMin: 8, repMax: 12, restSec: 120 });
  });
  it('번호 목록·물결(~)·분 단위', () => {
    expect(plan.days[1]!.items[0]).toMatchObject({ exerciseId: 'squat', sets: 4, repMin: 6, repMax: 10, weight: 80, restSec: 180 });
  });
  it('마크다운 표 (머리줄·구분줄은 건너뜀, 숫자만 있는 칸도)', () => {
    expect(plan.days[2]!.items.map((i) => [i.exerciseId, i.sets, i.repMin, i.repMax])).toEqual([
      ['rdl', 3, 8, 10],
      ['leg_extension', 3, 12, 15],
    ]);
  });
  it('모르는 종목은 exerciseId null, 단일 반복은 범위 같게', () => {
    expect(plan.days[1]!.items[2]).toMatchObject({ rawName: '이상한운동', exerciseId: null, repMin: 10, repMax: 10 });
  });
  it('설명 문장은 무시', () => {
    expect(plan.days.flatMap((d) => d.items).some((i) => /좋습니다|주의/.test(i.rawName))).toBe(false);
  });
  it('형식이 아니면 빈 결과', () => {
    expect(parseRoutinePlan('안녕하세요').days).toEqual([]);
  });
});

describe('planToProgram', () => {
  it('Claude 루틴을 앱 루틴으로 (세트·범위·휴식·목표 무게 그대로, 출처 imported)', () => {
    const p = planToProgram(parseRoutinePlan(ANSWER), 1000);
    expect(p.source).toBe('imported');
    expect(p.days[0]!.exercises[0]).toMatchObject({ exerciseId: 'bench_press', sets: 4, repMin: 6, repMax: 10, restSec: 150, targetWeight: 55, targetReps: 6 });
    expect(p.days[1]!.exercises).toHaveLength(2);
    expect(p.days[1]!.exercises[1]!.restSec).toBeGreaterThan(0);
  });
});

describe('parseRoutinePlan — Claude 가 자주 쓰는 다른 표기', () => {
  const text = [
    '### 상체A',
    '- 바벨 벤치프레스 4×6-10 (52.5kg, 휴식 2.5분)',
    '- 랫풀다운: 3 x 8~12회 @ 50kg',
    '- 덤벨 컬 — 10-12회 × 3세트',
    '| 종목 | 세트×반복 | 무게 |',
    '|---|---|---|',
    '| 시티드 케이블 로우 | 3×10-12 | 55kg |',
    '- 페이스풀 3세트 15회',
    '- 이건 읽을 수 없는 줄 6~8',
  ].join('\n');
  const plan = parseRoutinePlan(text);
  const items = plan.days[0]!.items;
  it('N×a-b, N x a~b, a-b회 × N세트, 표 칸 "3×10-12"', () => {
    expect(items.map((i) => [i.exerciseId, i.sets, i.repMin, i.repMax])).toEqual([
      ['bench_press', 4, 6, 10],
      ['lat_pulldown', 3, 8, 12],
      ['db_curl', 3, 10, 12],
      ['seated_cable_row', 3, 10, 12],
      ['face_pull', 3, 15, 15],
    ]);
    expect(items[0]).toMatchObject({ weight: 52.5, restSec: 150 });
    expect(items[1]).toMatchObject({ weight: 50 });
  });
  it('종목처럼 보이지만 못 읽은 줄은 skipped 로 알려줌', () => {
    expect(plan.skipped).toEqual(['- 이건 읽을 수 없는 줄 6~8']);
  });
});
