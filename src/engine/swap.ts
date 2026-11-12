import { allExercises, getExercise } from '../domain/exercises';
import type { Exercise, Muscle, Program } from '../domain/types';
import { recommendedRest } from './progression';
import { defaultRepRange } from './splits';

const primaries = (e: Exercise): Muscle[] =>
  (Object.entries(e.muscles) as [Muscle, number][]).filter(([, c]) => c >= 1).map(([m]) => m);

/**
 * 운동 중 바꿀 수 있는 대체 종목.
 * 같은 주동근을 공유하는 종목만, 유사도(주동근 겹침 · 복합/고립 일치 · 협력근 겹침) 순.
 * 근거: 종목을 적절히 바꿔도 근비대에 불리하지 않고 부위별 고른 발달에 도움 (Kassiano 2022)
 */
export function alternativesFor(exerciseId: string, limit = 8): Exercise[] {
  const src = getExercise(exerciseId);
  if (!src) return [];
  const srcPrim = new Set(primaries(src));
  const main = primaries(src)[0];
  return allExercises()
    .filter((e) => e.id !== src.id && main !== undefined && (e.muscles[main] ?? 0) >= 1)
    .map((e) => {
      const prim = primaries(e);
      const overlap = prim.filter((m) => srcPrim.has(m)).length / Math.max(srcPrim.size, prim.length);
      const sameType = e.compound === src.compound ? 1 : 0;
      const synergy = (Object.keys(src.muscles) as Muscle[]).filter((m) => (e.muscles[m] ?? 0) > 0).length / Object.keys(src.muscles).length;
      return { e, score: sameType * 2 + overlap * 1.5 + synergy };
    })
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name, 'ko'))
    .slice(0, limit)
    .map((x) => x.e);
}

/** 프로그램의 특정 day 에서 종목 교체 (세트 수 유지, 반복 범위·휴식은 새 종목 기본값). 원본 불변 */
export function replaceInProgram(program: Program, dayId: string, from: string, to: string): Program {
  const target = getExercise(to);
  if (!target) return program;
  return {
    ...program,
    days: program.days.map((d) => {
      if (d.id !== dayId || !d.exercises.some((e) => e.exerciseId === from)) return d;
      const [repMin, repMax] = defaultRepRange(target);
      return {
        ...d,
        exercises: d.exercises.map((pe) =>
          pe.exerciseId === from ? { exerciseId: to, sets: pe.sets, repMin, repMax, restSec: recommendedRest(target) } : pe,
        ),
      };
    }),
  };
}

/** 계획 종목 목록에 이번 세션 교체 내역 적용 */
export function applySwaps(ids: string[], swaps: Record<string, string> | undefined): string[] {
  if (!swaps) return ids;
  return ids.map((id) => swaps[id] ?? id);
}
