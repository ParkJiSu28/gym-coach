import { getExercise } from '../domain/exercises';
import { VOLUME_LANDMARKS } from '../domain/research';
import { MUSCLES, type Muscle, type SetLog } from '../domain/types';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/**
 * 근비대에 유효한 "하드 세트" 판정.
 * Refalo 2023: 실패 근접도가 중요 → RIR 4 이하만 유효 세트로 계산. 워밍업 제외.
 */
export function isHardSet(s: SetLog): boolean {
  return !s.warmup && s.reps > 0 && s.rir <= 4;
}

export function emptyMuscleMap(): Record<Muscle, number> {
  return Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
}

/** 기간 [from, to) 내 근육별 환산 세트 수 (직접 1, 간접 0.5) */
export function muscleVolume(sets: SetLog[], from: number, to: number): Record<Muscle, number> {
  const out = emptyMuscleMap();
  for (const s of sets) {
    if (s.completedAt < from || s.completedAt >= to || !isHardSet(s)) continue;
    const ex = getExercise(s.exerciseId);
    if (!ex) continue;
    for (const [m, c] of Object.entries(ex.muscles) as [Muscle, number][]) {
      out[m] += c;
    }
  }
  return out;
}

/** 최근 7일 롤링 볼륨 */
export function weeklyVolume(sets: SetLog[], now: number): Record<Muscle, number> {
  return muscleVolume(sets, now - WEEK_MS, now + 1);
}

export type VolumeStatus = 'below_mev' | 'low' | 'optimal' | 'high' | 'over_mrv';

export const VOLUME_STATUS_LABEL: Record<VolumeStatus, string> = {
  below_mev: '최소 자극 미만',
  low: '유지~하한',
  optimal: '최적 범위',
  high: '높음(회복 주의)',
  over_mrv: '회복 한계 초과',
};

export function volumeStatus(muscle: Muscle, sets: number): VolumeStatus {
  const l = VOLUME_LANDMARKS[muscle];
  if (sets > l.mrv) return 'over_mrv';
  if (sets > l.mavHigh) return 'high';
  if (sets >= l.mavLow) return 'optimal';
  if (sets >= l.mev && l.mev > 0) return 'low';
  if (l.mev === 0) return sets > 0 ? 'low' : 'below_mev';
  return 'below_mev';
}

/** 근육별 주당 훈련 빈도: 기간 내 해당 근육에 직접 세트(기여도 1)가 있었던 날짜 수 */
export function muscleFrequency(sets: SetLog[], from: number, to: number): Record<Muscle, number> {
  const days = new Map<Muscle, Set<number>>();
  for (const s of sets) {
    if (s.completedAt < from || s.completedAt >= to || !isHardSet(s)) continue;
    const ex = getExercise(s.exerciseId);
    if (!ex) continue;
    const day = Math.floor(s.completedAt / DAY_MS);
    for (const [m, c] of Object.entries(ex.muscles) as [Muscle, number][]) {
      if (c < 1) continue;
      if (!days.has(m)) days.set(m, new Set());
      days.get(m)!.add(day);
    }
  }
  const out = emptyMuscleMap();
  for (const [m, d] of days) out[m] = d.size;
  return out;
}
