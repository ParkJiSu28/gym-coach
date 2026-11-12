// 추정 1RM 계산 (Epley). RIR 을 반영해 "실패까지 가능했던 반복 수" = reps + rir 로 보정.

export function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** RIR 보정 추정 1RM: 3회 남기고 8회 했다면 11회 실패 세트로 간주 */
export function estimate1RM(weight: number, reps: number, rir = 0): number {
  return epley(weight, reps + Math.max(0, rir));
}

/** 추정 1RM 으로부터 목표 반복수·RIR 에 맞는 무게 역산 */
export function weightForTarget(e1rm: number, reps: number, rir: number): number {
  const total = reps + Math.max(0, rir);
  if (e1rm <= 0 || total <= 0) return 0;
  if (total === 1) return e1rm;
  return e1rm / (1 + total / 30);
}

/** 증량 단위로 반올림. mode 로 올림/내림 지정 */
export function roundToIncrement(
  weight: number,
  increment: number,
  mode: 'nearest' | 'down' | 'up' = 'nearest',
): number {
  if (increment <= 0) return Math.round(weight * 10) / 10;
  const q = weight / increment;
  const r = mode === 'down' ? Math.floor(q + 1e-9) : mode === 'up' ? Math.ceil(q - 1e-9) : Math.round(q);
  return Math.round(r * increment * 100) / 100;
}
