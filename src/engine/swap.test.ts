import { describe, expect, it } from 'vitest';
import { getExercise } from '../domain/exercises';
import { generateProgram } from './splits';
import { alternativesFor, applySwaps, replaceInProgram } from './swap';

describe('alternativesFor — 운동 중 바꿀 종목 추천', () => {
  it('벤치프레스 → 스미스 벤치프레스가 상위에 포함', () => {
    const alts = alternativesFor('bench_press').map((e) => e.id);
    expect(alts).toContain('smith_bench');
    expect(alts.indexOf('smith_bench')).toBeLessThan(4);
    expect(alts).not.toContain('bench_press');
  });

  it('같은 주동근만 추천 (가슴 종목에 하체 없음)', () => {
    for (const e of alternativesFor('bench_press')) {
      expect(getExercise(e.id)!.muscles.chest ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('복합 운동 대체는 복합 운동이 먼저', () => {
    const alts = alternativesFor('squat');
    expect(alts[0]!.compound).toBe(true);
  });

  it('개수 제한', () => {
    expect(alternativesFor('bench_press', 3)).toHaveLength(3);
  });

  it('알 수 없는 종목은 빈 배열', () => {
    expect(alternativesFor('nope')).toEqual([]);
  });
});

describe('replaceInProgram — 바꾼 종목을 루틴에도 반영', () => {
  const p = () => generateProgram({ daysPerWeek: 4, sessionMinutes: 75, priorities: [], now: 0, splitId: 'upper_lower' });

  it('해당 day 의 종목만 교체하고 세트 수는 유지', () => {
    const base = p();
    const day = base.days[0]!;
    const sets = day.exercises.find((e) => e.exerciseId === 'bench_press')!.sets;
    const next = replaceInProgram(base, day.id, 'bench_press', 'smith_bench');
    const pe = next.days[0]!.exercises.find((e) => e.exerciseId === 'smith_bench')!;
    expect(pe.sets).toBe(sets);
    expect(next.days[0]!.exercises.some((e) => e.exerciseId === 'bench_press')).toBe(false);
    expect(next.days[2]).toEqual(base.days[2]);
  });

  it('원본 불변', () => {
    const base = p();
    const snap = JSON.stringify(base);
    replaceInProgram(base, base.days[0]!.id, 'bench_press', 'smith_bench');
    expect(JSON.stringify(base)).toBe(snap);
  });

  it('없는 종목이면 그대로 반환', () => {
    const base = p();
    expect(replaceInProgram(base, base.days[0]!.id, 'squat', 'smith_squat').days).toEqual(base.days);
  });
});

describe('applySwaps — 이번 세션 교체 반영', () => {
  it('계획 종목 목록에 교체 적용', () => {
    expect(applySwaps(['bench_press', 'barbell_row'], { bench_press: 'smith_bench' })).toEqual(['smith_bench', 'barbell_row']);
  });
  it('교체가 없으면 그대로', () => {
    expect(applySwaps(['a', 'b'], undefined)).toEqual(['a', 'b']);
  });
});
