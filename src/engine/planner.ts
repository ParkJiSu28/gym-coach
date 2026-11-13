import { getExercise } from '../domain/exercises';
import type { Checkin, Exercise, Muscle, Program, ProgramDay, ProgramExercise, SetLog } from '../domain/types';
import { deloadAdvice, type DeloadAdvice } from './analysis';
import { muscleRecovery, readinessScore } from './fatigue';
import {
  adjustSets,
  exerciseHistory,
  mesoPosition,
  recommendedRest,
  suggestNext,
  targetRir,
  type MesoPosition,
  type Reason,
  type Suggestion,
} from './progression';
import { defaultRepRange } from './splits';
import { DAY_MS, weeklyVolume } from './volume';

/** 오늘의 계획을 세우는 데 필요한 공통 상태 (한 번 계산해서 여러 종목에 재사용) */
export interface PlanContext {
  now: number;
  sets: SetLog[];
  program?: Program;
  meso: MesoPosition | null;
  deload: boolean;
  advice: DeloadAdvice;
  weekly: Record<Muscle, number>;
  recovery: Record<Muscle, number>;
  readiness: number | null;
}

export function buildContext(params: {
  now: number;
  sets: SetLog[];
  checkins: Checkin[];
  program?: Program;
  /** 진행 중인 세션은 "다음 처방"의 이력에서 제외 */
  excludeSessionId?: number;
}): PlanContext {
  const { now, checkins, program } = params;
  const sets = params.excludeSessionId === undefined ? params.sets : params.sets.filter((s) => s.sessionId !== params.excludeSessionId);
  const meso = program ? mesoPosition(program, now) : null;
  const advice = deloadAdvice({ program, sets, checkins, now });
  const latest = [...checkins].sort((a, b) => b.date - a.date)[0];
  const readiness = latest && latest.date > now - DAY_MS ? readinessScore(latest) : null;
  return {
    now,
    sets,
    program,
    meso,
    deload: meso?.isDeload ?? false,
    advice,
    weekly: weeklyVolume(sets, now),
    recovery: muscleRecovery(sets, now),
    readiness,
  };
}

export interface ExercisePlan {
  exercise: Exercise;
  repMin: number;
  repMax: number;
  restSec: number;
  suggestion: Suggestion;
  reasons: Reason[];
}

export function planExercise(ctx: PlanContext, exerciseId: string, pe?: ProgramExercise): ExercisePlan | null {
  const exercise = getExercise(exerciseId);
  if (!exercise) return null;
  const [defMin, defMax] = defaultRepRange(exercise);
  const repMin = pe?.repMin ?? defMin;
  const repMax = pe?.repMax ?? defMax;
  const planned = pe?.sets ?? 3;
  const rir = ctx.meso ? targetRir(ctx.meso, exercise.compound) : 2;

  const history = exerciseHistory(ctx.sets, exerciseId);
  const adj = ctx.deload
    ? { sets: planned, reasons: [] as Reason[] }
    : adjustSets({
        exercise,
        plannedSets: planned,
        weekly: ctx.weekly,
        recovery: ctx.recovery,
        readiness: ctx.readiness,
        deload: false,
        hasHistory: history.length > 0,
        mesoWeek: ctx.meso?.week ?? null,
      });

  const suggestion = suggestNext({
    exercise,
    history,
    repMin,
    repMax,
    targetRir: rir,
    plannedSets: adj.sets,
    deload: ctx.deload,
    startWeight: pe?.targetWeight,
    startReps: pe?.targetReps,
  });

  const rirReason: Reason[] = ctx.meso && !ctx.deload
    ? [{ text: `메소사이클 ${ctx.meso.week}/${ctx.meso.totalWeeks}주차 → 목표 RIR ${rir} (주차가 지날수록 실패에 가깝게).`, citations: ['refalo2023', 'helms2016'] }]
    : [];

  return {
    exercise,
    repMin,
    repMax,
    restSec: pe?.restSec ?? recommendedRest(exercise),
    suggestion,
    reasons: [...suggestion.reasons, ...adj.reasons, ...rirReason],
  };
}

export function planDay(ctx: PlanContext, day: ProgramDay): ExercisePlan[] {
  return day.exercises.map((pe) => planExercise(ctx, pe.exerciseId, pe)).filter((p): p is ExercisePlan => p !== null);
}
