export interface RestStatus {
  remainingSec: number;
  done: boolean;
  /** 0~1 */
  progress: number;
}

export function restStatus(elapsedSec: number, targetSec: number): RestStatus {
  const e = Math.max(0, elapsedSec);
  const done = e >= targetSec;
  return {
    remainingSec: done ? 0 : Math.ceil(targetSec - e),
    done,
    progress: targetSec > 0 ? Math.min(1, e / targetSec) : 1,
  };
}

export const REST_MIN = 30;
export const REST_MAX = 600;

export function adjustRestTarget(target: number, delta: number): number {
  return Math.max(REST_MIN, Math.min(REST_MAX, target + delta));
}
