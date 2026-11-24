import type { Program } from '../domain/types';

export const REST_MIN = 30;
export const REST_MAX = 600;
export const clampRest = (s: number) => Math.min(REST_MAX, Math.max(REST_MIN, Math.round(s)));

/** id 를 한 칸 위(-1)/아래(+1)로. 끝이면 그대로 */
export function moveId(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** 끌어서 놓기: from 위치 항목을 to 위치로 (to 는 범위 안으로 맞춤) */
export function moveIndex<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length) return arr;
  const t = Math.min(arr.length - 1, Math.max(0, to));
  if (t === from) return arr;
  const out = [...arr];
  const [x] = out.splice(from, 1);
  out.splice(t, 0, x!);
  return out;
}

/** 저장된 순서를 먼저, 나머지는 원래 순서대로 뒤에 */
export function applyOrder(ids: string[], order?: string[]): string[] {
  if (!order?.length) return ids;
  const first = order.filter((id) => ids.includes(id));
  return [...first, ...ids.filter((id) => !first.includes(id))];
}

export function moveInDay(program: Program, dayId: string, index: number, dir: -1 | 1): Program {
  const next = structuredClone(program);
  const ex = next.days.find((d) => d.id === dayId)?.exercises;
  const j = index + dir;
  if (ex && index >= 0 && index < ex.length && j >= 0 && j < ex.length) [ex[index], ex[j]] = [ex[j]!, ex[index]!];
  return next;
}

export function setDayRest(program: Program, dayId: string, exerciseId: string, restSec: number): Program {
  const next = structuredClone(program);
  for (const pe of next.days.find((d) => d.id === dayId)?.exercises ?? []) if (pe.exerciseId === exerciseId) pe.restSec = clampRest(restSec);
  return next;
}

/** 숫자 칸 글자 → 숫자. 비었거나 숫자가 아니면 null */
export function parseNumDraft(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const v = Number(t.endsWith('.') ? t.slice(0, -1) : t);
  return Number.isFinite(v) ? v : null;
}
