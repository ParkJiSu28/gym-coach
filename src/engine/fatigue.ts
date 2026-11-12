import { getExercise } from '../domain/exercises';
import { RECOVERY_HOURS } from '../domain/research';
import type { Checkin, Muscle, SetLog } from '../domain/types';
import { DAY_MS, emptyMuscleMap, isHardSet, WEEK_MS } from './volume';

/**
 * 부위별 피로 모델 (앱 자체 추정 모델 — research.ts 의 app_fatigue_model 참고)
 *
 *   F_m(t) = Σ contribution_m × effort(rir) × exp(-(t - t_i) / τ_m)
 *   τ_m = RECOVERY_HOURS_m / ln(10)   → 회복 시간이 지나면 피로 90% 소멸
 *
 * 한 세션 기준 직접 하드 세트 SESSION_CAPACITY 개 ≈ 피로 100% 로 정규화.
 */
export const SESSION_CAPACITY = 8;
const HOUR_MS = 60 * 60 * 1000;

/** 실패 근접도가 높을수록 피로 기여 증가 */
export function effortFactor(rir: number): number {
  if (rir <= 1) return 1;
  if (rir <= 3) return 0.85;
  if (rir <= 4) return 0.6;
  return 0.3;
}

/** 14일이 지난 세트의 잔여 피로는 e^-10 수준이므로 계산에서 제외 */
const FATIGUE_HORIZON_MS = 14 * DAY_MS;

export function muscleFatigueUnits(sets: SetLog[], now: number): Record<Muscle, number> {
  const out = emptyMuscleMap();
  for (const s of sets) {
    if (s.warmup || s.completedAt > now || now - s.completedAt > FATIGUE_HORIZON_MS) continue;
    const ex = getExercise(s.exerciseId);
    if (!ex) continue;
    const dtH = (now - s.completedAt) / HOUR_MS;
    for (const [m, c] of Object.entries(ex.muscles) as [Muscle, number][]) {
      const tau = RECOVERY_HOURS[m] / Math.LN10;
      out[m] += c * effortFactor(s.rir) * Math.exp(-dtH / tau);
    }
  }
  return out;
}

/** 부위별 회복도 0~100 (100 = 완전 회복) */
export function muscleRecovery(sets: SetLog[], now: number): Record<Muscle, number> {
  const units = muscleFatigueUnits(sets, now);
  const out = emptyMuscleMap();
  for (const m of Object.keys(units) as Muscle[]) {
    const fatiguePct = Math.min(100, (units[m] / SESSION_CAPACITY) * 100);
    out[m] = Math.round(100 - fatiguePct);
  }
  return out;
}

/** 해당 근육이 다시 ≥ target% 회복될 때까지 남은 시간(시간). 이미 회복됐으면 0 */
export function hoursUntilRecovered(sets: SetLog[], muscle: Muscle, now: number, target = 80): number {
  const recent = sets.filter((s) => s.completedAt <= now && now - s.completedAt <= FATIGUE_HORIZON_MS);
  for (let h = 0; h <= 168; h += 1) {
    if (muscleRecovery(recent, now + h * HOUR_MS)[muscle] >= target) return h;
  }
  return 168;
}

/** 체크인 기반 컨디션 점수 0~100. 체크인이 없으면 null */
export function readinessScore(c: Checkin | undefined): number | null {
  if (!c) return null;
  const avg = (c.sleep + c.soreness + c.motivation + c.stress) / 4;
  return Math.round(((avg - 1) / 4) * 100);
}

export interface SystemicLoad {
  /** 최근 7일 하드 세트 수 */
  acute: number;
  /** 직전 28일의 주 평균 하드 세트 수 */
  chronic: number;
  /** acute/chronic. 기록이 부족하면 null */
  ratio: number | null;
  level: 'low' | 'normal' | 'elevated' | 'high';
}

/**
 * 전신 부하: 급성(7일) 대 만성(28일 주평균) 비율.
 * 비율이 높으면 갑작스러운 볼륨 증가 → 피로 위험 신호로 사용(추정 지표).
 */
export function systemicLoad(sets: SetLog[], now: number): SystemicLoad {
  const hard = sets.filter(isHardSet);
  const acute = hard.filter((s) => s.completedAt > now - WEEK_MS && s.completedAt <= now).length;
  const chronicSets = hard.filter((s) => s.completedAt > now - 4 * WEEK_MS && s.completedAt <= now);
  const firstTs = chronicSets.reduce((min, s) => Math.min(min, s.completedAt), now);
  const spanWeeks = Math.max(1, Math.min(4, (now - firstTs) / WEEK_MS));
  const chronic = chronicSets.length / spanWeeks;
  const enoughHistory = now - firstTs >= 14 * DAY_MS;
  const ratio = enoughHistory && chronic > 0 ? acute / chronic : null;
  let level: SystemicLoad['level'] = 'normal';
  if (ratio === null) level = acute === 0 ? 'low' : 'normal';
  else if (ratio < 0.8) level = 'low';
  else if (ratio <= 1.3) level = 'normal';
  else if (ratio <= 1.5) level = 'elevated';
  else level = 'high';
  return { acute, chronic: Math.round(chronic * 10) / 10, ratio: ratio === null ? null : Math.round(ratio * 100) / 100, level };
}
