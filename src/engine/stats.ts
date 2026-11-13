import { getExercise } from '../domain/exercises';
import { MUSCLES, type Muscle, type SetLog } from '../domain/types';
import { epley } from './e1rm';

const DAY = 86_400_000;
const WEEK = 7 * DAY;

export interface WeekSummary {
  /** 주 시작 시각 (now 기준 7일 단위로 거슬러 올라감) */
  start: number;
  sessions: number;
  sets: number;
  /** 총 볼륨 (무게 × 반복 합, kg) */
  tonnage: number;
  /** 부위별 세트 (직접 1, 간접 0.5) */
  muscles: Record<Muscle, number>;
}

const emptyMuscles = () => Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;

/** 최근 n주 주간 요약 (오래된 주 → 최신 주). 워밍업 제외 */
export function weeklySummary(sets: SetLog[], now: number, weeks = 8): WeekSummary[] {
  const work = sets.filter((s) => !s.warmup);
  const out: WeekSummary[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = now - (i + 1) * WEEK;
    const stop = now - i * WEEK;
    const ws = work.filter((s) => s.completedAt > start && s.completedAt <= stop);
    const muscles = emptyMuscles();
    for (const s of ws) {
      for (const [m, c] of Object.entries(getExercise(s.exerciseId)?.muscles ?? {}) as [Muscle, number][]) muscles[m] += c;
    }
    out.push({
      start,
      sessions: new Set(ws.map((s) => s.sessionId)).size,
      sets: ws.length,
      tonnage: Math.round(ws.reduce((a, s) => a + s.weight * s.reps, 0)),
      muscles,
    });
  }
  return out;
}

export interface BestSet {
  weight: number;
  reps: number;
  at: number;
}

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  sessions: number;
  first: BestSet;
  last: BestSet;
  firstE1rm: number;
  lastE1rm: number;
  /** 추정 1RM 변화율 (%) — 첫 세션 최고 세트 → 최근 세션 최고 세트 */
  changePct: number;
}

/** 종목별 진행: 세션마다 추정 1RM 이 가장 높은 세트로 비교. 최근에 한 종목 먼저 */
export function exerciseProgress(sets: SetLog[], _now: number): ExerciseProgress[] {
  const byEx = new Map<string, Map<number, SetLog[]>>();
  for (const s of sets) {
    if (s.warmup || s.weight <= 0) continue;
    const sessions = byEx.get(s.exerciseId) ?? new Map<number, SetLog[]>();
    sessions.set(s.sessionId, [...(sessions.get(s.sessionId) ?? []), s]);
    byEx.set(s.exerciseId, sessions);
  }
  const out: ExerciseProgress[] = [];
  for (const [exerciseId, sessions] of byEx) {
    const bests = [...sessions.values()]
      .map((list) => list.reduce((b, s) => (epley(s.weight, s.reps) > epley(b.weight, b.reps) ? s : b)))
      .sort((a, b) => a.completedAt - b.completedAt);
    const f = bests[0]!;
    const l = bests.at(-1)!;
    const firstE1rm = epley(f.weight, f.reps);
    const lastE1rm = epley(l.weight, l.reps);
    out.push({
      exerciseId,
      name: getExercise(exerciseId)?.name ?? exerciseId,
      sessions: bests.length,
      first: { weight: f.weight, reps: f.reps, at: f.completedAt },
      last: { weight: l.weight, reps: l.reps, at: l.completedAt },
      firstE1rm: Math.round(firstE1rm * 10) / 10,
      lastE1rm: Math.round(lastE1rm * 10) / 10,
      changePct: firstE1rm > 0 ? Math.round(((lastE1rm - firstE1rm) / firstE1rm) * 1000) / 10 : 0,
    });
  }
  return out.sort((a, b) => b.last.at - a.last.at);
}
