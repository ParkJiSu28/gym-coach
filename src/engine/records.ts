import { getExercise } from '../domain/exercises';
import { DAY_MS } from './volume';

/**
 * RIR 을 재지 않은 기록의 기본값.
 * 일반적인 헬스 이용자는 실패 2~3회 전에서 세트를 끝내는 경우가 많고,
 * 사람들은 남은 반복을 ~1회 과소평가한다(Halperin 2022) → 보수적으로 2 로 둔다.
 */
export const DEFAULT_UNKNOWN_RIR = 2;

export interface ManualSetInput {
  weight: number;
  reps: number;
  /** 모르면 null/undefined */
  rir?: number | null;
}

/** 다른 앱 기록을 손으로 옮겨 적는 단위: 하루 · 한 종목 · 여러 세트 */
export interface ManualEntry {
  /** 운동한 날짜 (그날의 아무 시각이나 가능, 로컬 날짜로 정규화) */
  date: number;
  exerciseId: string;
  sets: ManualSetInput[];
}

export interface NormalizedManualSet {
  weight: number;
  reps: number;
  rir: number;
  rirEstimated: boolean;
}

export interface NormalizedManualEntry {
  date: number;
  exerciseId: string;
  sets: NormalizedManualSet[];
}

export class ManualRecordError extends Error {}

const MAX_SETS = 20;

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 무게·반복·RIR 단일 값 검증 (세트 수정에도 재사용) */
export function validateSetValues(v: { weight?: number; reps?: number; rir?: number | null }, prefix = ''): void {
  if (v.weight !== undefined && (!Number.isFinite(v.weight) || v.weight < 0 || v.weight > 1000)) {
    throw new ManualRecordError(`${prefix}무게는 0~1000kg 사이 숫자여야 합니다.`);
  }
  if (v.reps !== undefined && (!Number.isInteger(v.reps) || v.reps < 1 || v.reps > 100)) {
    throw new ManualRecordError(`${prefix}반복 수는 1~100 사이 정수여야 합니다.`);
  }
  if (v.rir !== undefined && v.rir !== null && (!Number.isFinite(v.rir) || v.rir < 0 || v.rir > 10)) {
    throw new ManualRecordError(`${prefix}RIR 은 0~10 사이여야 합니다.`);
  }
}

export function validateManualEntry(entry: ManualEntry, now: number): NormalizedManualEntry {
  if (!getExercise(entry.exerciseId)) throw new ManualRecordError('알 수 없는 종목입니다.');
  if (!Number.isFinite(entry.date)) throw new ManualRecordError('날짜를 입력하세요.');
  if (startOfLocalDay(entry.date) > startOfLocalDay(now)) throw new ManualRecordError('미래 날짜는 기록할 수 없습니다.');
  if (entry.sets.length === 0) throw new ManualRecordError('세트를 1개 이상 입력하세요.');
  if (entry.sets.length > MAX_SETS) throw new ManualRecordError(`세트는 한 번에 ${MAX_SETS}개까지 입력할 수 있습니다.`);

  const sets = entry.sets.map((s, i) => {
    validateSetValues(s, `${i + 1}번째 세트: `);
    const known = s.rir !== undefined && s.rir !== null;
    return { weight: s.weight, reps: s.reps, rir: known ? s.rir! : DEFAULT_UNKNOWN_RIR, rirEstimated: !known };
  });
  return { date: entry.date, exerciseId: entry.exerciseId, sets };
}

/**
 * 직접 입력 세트의 완료 시각.
 * 과거 날짜는 그날 정오부터 3분 간격, 오늘이면 현재 시각 이전에 끝나도록 배치.
 * offset: 같은 날 이미 입력된 세트 수 (그 뒤에 이어서 배치)
 */
export function manualSetTimes(date: number, count: number, now: number, offset = 0): number[] {
  const GAP = 180_000;
  const day = startOfLocalDay(date);
  const isToday = day === startOfLocalDay(now);
  const noon = day + 12 * 60 * 60 * 1000;
  let base = noon + offset * GAP;
  if (isToday) {
    const latestStart = now - (offset + count) * GAP;
    base = Math.max(day, Math.min(noon, latestStart)) + offset * GAP;
  }
  return Array.from({ length: count }, (_, i) => Math.min(base + i * GAP, isToday ? now : day + DAY_MS - 1));
}
