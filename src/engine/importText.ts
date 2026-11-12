import { EXERCISE_ALIASES } from '../domain/aliases';
import { allExercises } from '../domain/exercises';

/**
 * 다른 앱 기록 캡처를 아이폰 "텍스트 인식"으로 복사해 붙여넣은 글자 → 종목·세트·날짜.
 * 인식 결과는 항상 미리보기에서 사용자가 확인·수정한 뒤 저장한다.
 */

export interface ParsedSet {
  weight: number;
  reps: number;
}

export interface ParsedExercise {
  /** 캡처에서 읽은 원래 이름 (없으면 '') */
  name: string;
  /** 앱 종목 id. 못 맞추면 null → 사용자가 선택 */
  exerciseId: string | null;
  sets: ParsedSet[];
}

export interface ParsedImport {
  title?: string;
  date?: number;
  exercises: ParsedExercise[];
  /** 범위를 벗어나 버린 세트 설명 */
  skipped: string[];
}

export const normalizeName = (s: string): string => s.toLowerCase().replace(/[\s()[\]{}\-_.·,/|]/g, '');

function nameIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const e of allExercises()) idx.set(normalizeName(e.name), e.id);
  for (const [id, aliases] of Object.entries(EXERCISE_ALIASES)) for (const a of aliases) idx.set(normalizeName(a), id);
  return idx;
}

/** 이름 → 종목 id: 정확히 일치 → 별칭 → 가장 긴(3자 이상) 포함 일치 */
export function matchExercise(name: string): string | null {
  const n = normalizeName(name);
  if (!n) return null;
  const idx = nameIndex();
  const exact = idx.get(n);
  if (exact) return exact;
  let best: { key: string; id: string } | null = null;
  for (const [key, id] of idx) {
    if (key.length >= 3 && n.includes(key) && (!best || key.length > best.key.length)) best = { key, id };
  }
  return best?.id ?? null;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const PAIR = new RegExp(String.raw`${NUM}\s*(?:kg|㎏)?\s*[x×*]\s*(\d+)(?!\s*(?:kg|㎏|lb))`, 'i');
const WEIGHT = new RegExp(String.raw`${NUM}\s*(kg|㎏|킬로|키로|lbs?|파운드)`, 'i');
const REPS = /(\d+)\s*(?:회|reps?|개)(?![a-z])/i;
const DATE_FULL = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/;
const DATE_MD = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
const NOISE = /^(?:[+\-–:•·]|ad\b|ads\b|저장|메모|세트|불러오기|pro$|웜업|종목\s*추가|휴식|타이머|완료|편집|삭제|공유|운동\s*종료)|install|광고|unity\s*ads/i;

const num = (s: string) => Number(s.replace(',', '.'));
const toKg = (value: number, unit: string) => (/lb|파운드/i.test(unit) ? Math.round(value * 0.45359237 * 2) / 2 : value);

function isNameCandidate(s: string): boolean {
  const t = s.trim();
  if (!t || NOISE.test(t)) return false;
  const hangul = (t.match(/[가-힣]/g) ?? []).length;
  const latin = (t.match(/[a-z]/gi) ?? []).length;
  return hangul >= 2 || latin >= 4;
}

function parseDate(line: string, now: number): number | undefined {
  const full = DATE_FULL.exec(line);
  const md = full ? null : DATE_MD.exec(line);
  if (!full && !md) return undefined;
  const y = full ? Number(full[1]) : new Date(now).getFullYear();
  const m = Number(full ? full[2] : md![1]);
  const d = Number(full ? full[3] : md![2]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  let ts = new Date(y, m - 1, d).getTime();
  if (!full && ts > now) ts = new Date(y - 1, m - 1, d).getTime();
  return ts;
}

interface Entry extends ParsedExercise {
  pending?: number;
}

export function parseWorkoutText(text: string, now = Date.now()): ParsedImport {
  const entries: Entry[] = [];
  const skipped: string[] = [];
  let date: number | undefined;
  let current: Entry | null = null;

  const start = (name: string): Entry => {
    const clean = name.trim();
    if (current && normalizeName(current.name) === normalizeName(clean)) return current;
    const next: Entry = { name: clean, exerciseId: matchExercise(clean), sets: [] };
    entries.push(next);
    current = next;
    return next;
  };

  const addSet = (e: Entry, weight: number, reps: number) => {
    if (!Number.isFinite(weight) || weight < 0 || weight > 1000 || !Number.isInteger(reps) || reps < 1 || reps > 100) {
      skipped.push(`${e.name || '이름 없음'}: ${weight}kg × ${reps}회`);
    } else e.sets.push({ weight, reps });
    e.pending = undefined;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const pair = PAIR.exec(line);
    const w = WEIGHT.exec(line);
    const r = REPS.exec(line);

    if (!pair && !w && !r) {
      const d = parseDate(line, now);
      if (d !== undefined) {
        date ??= d;
        continue;
      }
      if (isNameCandidate(line)) start(line);
      continue;
    }

    // 같은 줄 앞부분이 종목 이름인 경우 ("스쿼트 100kg 5회")
    const firstIdx = Math.min(...[pair?.index, w?.index, r?.index].filter((i): i is number => i !== undefined));
    const prefix = line.slice(0, firstIdx).replace(/\d+\s*$/, '');
    const e: Entry = isNameCandidate(prefix) ? start(prefix) : (current ?? start(''));

    if (pair) {
      addSet(e, num(pair[1]!), Number(pair[2]));
      continue;
    }
    if (w) e.pending = toKg(num(w[1]!), w[2]!);
    if (r) addSet(e, e.pending ?? e.sets.at(-1)?.weight ?? 0, Number(r[1]));
  }

  // 세트도 없고 종목도 못 맞춘 줄(루틴 제목·광고)은 버린다. 그중 첫 종목보다 앞에 나온 것을 루틴 제목으로 본다
  const isKept = (e: Entry) => e.sets.length > 0 || e.exerciseId !== null;
  const firstKept = entries.findIndex(isKept);
  const title = entries.find((e, i) => !isKept(e) && e.name && (firstKept === -1 || i < firstKept))?.name;

  return {
    ...(title ? { title } : {}),
    ...(date !== undefined ? { date } : {}),
    exercises: entries.filter(isKept).map((e) => ({ name: e.name, exerciseId: e.exerciseId, sets: e.sets })),
    skipped,
  };
}
