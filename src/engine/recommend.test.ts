import { describe, expect, it } from 'vitest';
import type { SetLog, WorkoutSession } from '../domain/types';
import { inferSessionMinutes, inferTrainingDays, inferWeekdays, laggingMuscles, personalizeProgram, recommendFromRecords } from './recommend';
import { generateProgram } from './splits';
import { DAY_MS, WEEK_MS } from './volume';

const NOW = Date.UTC(2026, 2, 10, 15);
const H = 60 * 60 * 1000;

let id = 1;
/** 특정 날짜에 같은 무게·반복으로 n세트 */
function rec(exerciseId: string, daysAgo: number, weight: number, reps: number, n = 3, rir = 2, sessionId = 1000 + daysAgo): SetLog[] {
  const base = NOW - daysAgo * DAY_MS;
  return Array.from({ length: n }, (_, i) => ({
    id: id++,
    sessionId,
    exerciseId,
    order: i,
    weight,
    reps,
    rir,
    completedAt: base + i * 180_000,
  }));
}

function session(daysAgo: number, minutes: number, manual = false): WorkoutSession {
  const startedAt = NOW - daysAgo * DAY_MS;
  return { id: 1000 + daysAgo, startedAt, endedAt: startedAt + minutes * 60_000, manual };
}

describe('inferTrainingDays — 최근 4주 실제 운동 일수', () => {
  it('기록이 없으면 주 3일', () => {
    expect(inferTrainingDays([], NOW)).toBe(3);
  });

  it('4주 동안 주 4일 → 4', () => {
    const sets: SetLog[] = [];
    for (let w = 0; w < 4; w++) for (const d of [1, 2, 4, 5]) sets.push(...rec('squat', w * 7 + d, 100, 8, 1));
    expect(inferTrainingDays(sets, NOW)).toBe(4);
  });

  it('같은 날 여러 종목·세트는 하루로 계산', () => {
    const sets = [1, 3, 5].flatMap((d) => [...rec('squat', d, 100, 8, 5), ...rec('bench_press', d, 80, 8, 5)]);
    expect(inferTrainingDays(sets, NOW)).toBe(3);
  });

  it('28일보다 오래된 기록은 무시', () => {
    const sets: SetLog[] = [];
    for (let d = 30; d < 60; d++) sets.push(...rec('squat', d, 100, 8, 1));
    expect(inferTrainingDays(sets, NOW)).toBe(3);
  });

  it('주 7일 기록도 최대 6으로 제한', () => {
    const sets: SetLog[] = [];
    for (let d = 1; d <= 28; d++) sets.push(...rec('squat', d, 100, 8, 1));
    expect(inferTrainingDays(sets, NOW)).toBe(6);
  });

  it('워밍업만 있는 날은 운동일이 아님', () => {
    const warm = rec('squat', 1, 40, 10, 3).map((s) => ({ ...s, warmup: true }));
    expect(inferTrainingDays(warm, NOW)).toBe(3);
  });
});

describe('inferWeekdays — 자주 운동한 요일', () => {
  it('가장 자주 운동한 요일 n개를 월요일부터 정렬', () => {
    const sets: SetLog[] = [];
    for (let w = 0; w < 4; w++) for (const d of [1, 3, 6]) sets.push(...rec('squat', w * 7 + d, 100, 8, 1));
    const days = new Set(sets.map((s) => new Date(s.completedAt).getDay()));
    const r = inferWeekdays(sets, NOW, 3);
    expect(r).toHaveLength(3);
    expect(new Set(r)).toEqual(days);
  });

  it('기록 요일이 일부만 있으면 나머지는 그 요일과 붙지 않게 띄워서 채움', () => {
    // 기록한 요일이 무엇이든(일~토 7가지) 성립해야 함
    for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
      const one = rec('squat', daysAgo, 100, 8, 1); // 하루만 기록
      const recorded = new Date(one[0]!.completedAt).getDay();
      for (const n of [2, 3]) {
        const r = inferWeekdays(one, NOW, n);
        expect(r).toContain(recorded);
        expect(r).toHaveLength(n);
        const set = new Set(r);
        expect(r.some((d) => set.has((d + 1) % 7)), `기록 요일 ${recorded}, n=${n} → ${r}`).toBe(false); // 연속 요일 없음
      }
    }
  });

  it('기록이 부족하면 하루씩 띄운 기본 요일로 채움', () => {
    expect(inferWeekdays([], NOW, 3)).toEqual([1, 3, 5]);
    expect(inferWeekdays([], NOW, 4)).toEqual([1, 2, 4, 5]);
    expect(inferWeekdays([], NOW, 2)).toEqual([1, 4]);
  });
});

describe('inferSessionMinutes — 실제 운동 시간', () => {
  it('세션이 없으면 60분', () => {
    expect(inferSessionMinutes([], NOW)).toBe(60);
  });

  it('완료된 실제 세션 평균을 5분 단위로', () => {
    expect(inferSessionMinutes([session(1, 52), session(3, 61), session(5, 70)], NOW)).toBe(60);
  });

  it('직접 입력(manual) 세션과 진행 중 세션은 제외', () => {
    const open: WorkoutSession = { id: 9, startedAt: NOW - H };
    expect(inferSessionMinutes([session(1, 90), session(2, 5, true), open], NOW)).toBe(90);
  });

  it('30~120분 범위로 제한', () => {
    expect(inferSessionMinutes([session(1, 10)], NOW)).toBe(30);
    expect(inferSessionMinutes([session(1, 200)], NOW)).toBe(120);
  });
});

describe('laggingMuscles — 기록 대비 부족한 부위', () => {
  it('기록이 없으면 없음', () => {
    expect(laggingMuscles([], NOW)).toEqual([]);
  });

  it('훈련은 했지만 최적 하한보다 크게 모자란 부위를 우선', () => {
    const sets: SetLog[] = [];
    for (let w = 0; w < 4; w++) {
      sets.push(...rec('bench_press', w * 7 + 1, 80, 8, 14)); // 가슴 주 14세트: 충분
      sets.push(...rec('lateral_raise', w * 7 + 2, 10, 15, 2)); // 측면 삼각근 주 2세트: 부족
      sets.push(...rec('squat', w * 7 + 3, 100, 8, 8)); // 사두 주 8세트: 약간 부족
    }
    const lag = laggingMuscles(sets, NOW);
    expect(lag[0]).toBe('side_delts');
    expect(lag).not.toContain('chest');
    expect(lag.length).toBeLessThanOrEqual(2);
  });

  it('한 번도 훈련하지 않은 부위는 "부족"으로 판단하지 않음 (데이터 없음)', () => {
    const sets: SetLog[] = [];
    for (let w = 0; w < 4; w++) sets.push(...rec('bench_press', w * 7 + 1, 80, 8, 14));
    expect(laggingMuscles(sets, NOW)).not.toContain('quads');
  });
});

describe('personalizeProgram — 내가 하던 종목으로 교체', () => {
  const base = () => generateProgram({ daysPerWeek: 4, sessionMinutes: 75, priorities: [], now: NOW, splitId: 'upper_lower' });

  it('기록이 없으면 변경 없음', () => {
    const p = base();
    const { program, substitutions } = personalizeProgram(p, []);
    expect(substitutions).toEqual([]);
    expect(program.days).toEqual(p.days);
  });

  it('같은 주동근·같은 유형(복합)의 기록 종목으로 교체', () => {
    const sets = [...rec('machine_chest_press', 2, 70, 10), ...rec('machine_chest_press', 5, 67.5, 10)];
    const { program, substitutions } = personalizeProgram(base(), sets);
    const upperA = program.days[0]!.exercises.map((e) => e.exerciseId);
    expect(upperA).toContain('machine_chest_press');
    expect(upperA).not.toContain('bench_press');
    expect(substitutions).toContainEqual({ dayId: program.days[0]!.id, from: 'bench_press', to: 'machine_chest_press' });
  });

  it('이미 기록이 있는 템플릿 종목은 그대로 유지', () => {
    const sets = [...rec('bench_press', 2, 80, 8), ...rec('machine_chest_press', 3, 70, 10)];
    const { program } = personalizeProgram(base(), sets);
    expect(program.days[0]!.exercises.map((e) => e.exerciseId)).toContain('bench_press');
  });

  it('같은 day 안에 같은 종목이 중복되지 않음', () => {
    const sets = rec('machine_chest_press', 2, 70, 10);
    const { program } = personalizeProgram(base(), sets);
    for (const d of program.days) {
      const ids = d.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('고립 운동 기록은 복합 운동 자리를 대체하지 않음', () => {
    const sets = rec('cable_fly', 2, 20, 12);
    const { program } = personalizeProgram(base(), sets);
    expect(program.days[0]!.exercises.map((e) => e.exerciseId)).toContain('bench_press');
  });

  it('교체된 종목은 그 종목의 기본 반복 범위·휴식을 사용하고 세트 수는 유지', () => {
    const p = base();
    const benchSets = p.days[0]!.exercises.find((e) => e.exerciseId === 'bench_press')!.sets;
    const { program } = personalizeProgram(p, rec('machine_chest_press', 2, 70, 10));
    const pe = program.days[0]!.exercises.find((e) => e.exerciseId === 'machine_chest_press')!;
    expect(pe.sets).toBe(benchSets);
    // 머신 복합 운동 → 근비대 기본 범위 8~12회
    expect([pe.repMin, pe.repMax]).toEqual([8, 12]);
    expect(pe.restSec).toBe(150);
  });

  it('원본 프로그램을 변경하지 않음 (불변)', () => {
    const p = base();
    const snapshot = JSON.stringify(p);
    personalizeProgram(p, rec('machine_chest_press', 2, 70, 10));
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe('recommendFromRecords — 버튼 하나로 루틴 + 무게·횟수·세트', () => {
  it('기록이 없어도 기본 루틴을 만들고 안내 문구 제공', () => {
    const r = recommendFromRecords({ sets: [], sessions: [], checkins: [], now: NOW });
    expect(r.hasRecords).toBe(false);
    expect(r.daysPerWeek).toBe(3);
    expect(r.program.splitId).toBe('full_body');
    expect(r.plans.length).toBe(r.program.days.length);
    expect(r.plans[0]!.exercises.every((p) => p.suggestion.action === 'start')).toBe(true);
    expect(r.insights[0]!.text).toMatch(/기록이 없/);
  });

  it('기록이 있으면 운동 일수·분할을 추론하고 무게를 처방', () => {
    const sets: SetLog[] = [];
    const sessions: WorkoutSession[] = [];
    for (let w = 0; w < 4; w++) {
      for (const d of [1, 2, 4, 5]) {
        const daysAgo = w * 7 + d;
        sessions.push(session(daysAgo, 65));
        sets.push(...rec(d % 2 ? 'bench_press' : 'squat', daysAgo, d % 2 ? 80 : 120, 10));
      }
    }
    const r = recommendFromRecords({ sets, sessions, checkins: [], now: NOW });
    expect(r.hasRecords).toBe(true);
    expect(r.daysPerWeek).toBe(4);
    expect(r.sessionMinutes).toBe(65);
    expect(r.program.splitId).toBe('upper_lower');

    const bench = r.plans.flatMap((d) => d.exercises).find((p) => p.exercise.id === 'bench_press')!;
    // 최근 80kg × 10회(상한) 3세트 → 증량
    expect(bench.suggestion.action).toBe('increase_load');
    expect(bench.suggestion.weight).toBeGreaterThanOrEqual(82.5);
    expect(r.insights.some((i) => i.text.includes('주 4일'))).toBe(true);
    expect(r.insights.some((i) => i.citations.includes('schoenfeld2016freq'))).toBe(true);
  });

  it('사용자가 지정한 값이 추론값보다 우선', () => {
    const r = recommendFromRecords({
      sets: rec('bench_press', 2, 80, 8),
      sessions: [],
      checkins: [],
      now: NOW,
      overrides: { daysPerWeek: 6, sessionMinutes: 45, priorities: ['biceps'] },
    });
    expect(r.daysPerWeek).toBe(6);
    expect(r.sessionMinutes).toBe(45);
    expect(r.priorities).toEqual(['biceps']);
    expect(r.program.splitId).toBe('ppl');
  });

  it('부족 부위는 자동으로 우선 부위가 되고 근거가 붙음', () => {
    const sets: SetLog[] = [];
    for (let w = 0; w < 4; w++) {
      sets.push(...rec('bench_press', w * 7 + 1, 80, 8, 14));
      sets.push(...rec('lateral_raise', w * 7 + 2, 10, 15, 2));
    }
    const r = recommendFromRecords({ sets, sessions: [], checkins: [], now: NOW });
    expect(r.priorities).toContain('side_delts');
    const lagInsight = r.insights.find((i) => i.text.includes('측면 삼각근'));
    expect(lagInsight?.citations).toContain('schoenfeld2017volume');
  });

  it('기록된 종목으로 교체한 내역을 인사이트로 설명', () => {
    // 70kg × 8회 (범위 6~10 안) → 같은 무게로 반복 +1
    const r = recommendFromRecords({ sets: rec('machine_chest_press', 2, 70, 8), sessions: [], checkins: [], now: NOW });
    expect(r.insights.some((i) => i.text.includes('머신 체스트 프레스'))).toBe(true);
    const plan = r.plans.flatMap((d) => d.exercises).find((p) => p.exercise.id === 'machine_chest_press')!;
    expect(plan.suggestion.weight).toBe(70);
  });

  it('운동 가능 요일을 지정하면 그 요일 수·요일에 맞춰 프로그램 생성', () => {
    const r = recommendFromRecords({
      sets: rec('bench_press', 2, 80, 8),
      sessions: [],
      checkins: [],
      now: NOW,
      overrides: { weekdays: [5, 1, 3] },
    });
    expect(r.daysPerWeek).toBe(3);
    expect(r.program.weekdays).toEqual([1, 3, 5]);
    expect(r.program.days).toHaveLength(3);
    expect(r.insights.some((i) => /월·수·금/.test(i.text))).toBe(true);
  });

  it('요일 지정 시 연속 전신 운동이면 경고 인사이트 포함', () => {
    const r = recommendFromRecords({ sets: [], sessions: [], checkins: [], now: NOW, overrides: { weekdays: [1, 2, 3] } });
    expect(r.insights.some((i) => /연속/.test(i.text))).toBe(true);
  });

  it('요일을 지정하지 않으면 기록에서 자주 운동한 요일을 추론', () => {
    const sets: SetLog[] = [];
    // 2026-03-10(화) 기준 과거 4주의 월·목 기록
    for (let w = 0; w < 4; w++) for (const d of [1, 5]) sets.push(...rec('squat', w * 7 + d, 100, 8));
    const r = recommendFromRecords({ sets, sessions: [], checkins: [], now: NOW });
    expect(r.program.weekdays).toEqual(inferWeekdays(sets, NOW, r.daysPerWeek));
    expect(r.program.weekdays).toHaveLength(r.daysPerWeek);
  });

  it('새 루틴은 오늘부터 메소사이클 1주차로 시작', () => {
    const r = recommendFromRecords({ sets: [], sessions: [], checkins: [], now: NOW });
    expect(r.program.mesoStart).toBe(NOW);
    expect(r.program.active).toBe(true);
    expect(NOW - r.program.mesoStart).toBeLessThan(WEEK_MS);
  });
});
