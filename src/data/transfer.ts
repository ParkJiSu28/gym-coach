import { getExercise } from '../domain/exercises';
import type { Checkin, Exercise, SetLog, WorkoutSession } from '../domain/types';
import { ManualRecordError, validateSetValues } from '../engine/records';
import { DAY_MS } from '../engine/volume';
import { db, loadCustomExercises, type GymDB } from './db';

/**
 * 기기 간 기록 옮기기 (서버 없음).
 * 보내는 기기: 기록 → 압축 → 한 줄 코드 "GC1.xxxx" → 카톡 등으로 전송
 * 받는 기기: 코드 붙여넣기 → 검증 → 기존 기록에 합치기 (중복 제거)
 */

/** [종목 id, 무게, 반복, RIR, 플래그(1=워밍업, 2=RIR 추정), 완료 시각, 휴식 초 | null] */
type SetTuple = [string, number, number, number, number, number, number | null];

interface SessionDump {
  startedAt: number;
  endedAt: number;
  manual?: boolean;
  sets: SetTuple[];
}

export interface TransferPayload {
  v: 1;
  createdAt: number;
  sessions: SessionDump[];
  customExercises: Exercise[];
  checkins: Checkin[];
}

export class TransferError extends Error {}

// ─────────────────────────────── 인코딩

const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// ─────────────────────────────── 보내기

export async function createTransferCode(
  opts: { now?: number; sinceDays?: number } = {},
  database: GymDB = db,
): Promise<{ code: string; sessions: number; sets: number }> {
  const now = opts.now ?? Date.now();
  const since = opts.sinceDays ? now - opts.sinceDays * DAY_MS : -Infinity;
  const sessions = (await database.sessions.toArray()).filter((s) => s.endedAt && s.startedAt >= since).sort((a, b) => a.startedAt - b.startedAt);
  const allSets = await database.sets.where('sessionId').anyOf(sessions.map((s) => s.id!)).toArray();

  const dumps: SessionDump[] = [];
  for (const s of sessions) {
    const sets = allSets
      .filter((x) => x.sessionId === s.id)
      .sort((a, b) => a.order - b.order)
      .map((x): SetTuple => [x.exerciseId, x.weight, x.reps, x.rir, (x.warmup ? 1 : 0) | (x.rirEstimated ? 2 : 0), x.completedAt, x.restSec ?? null]);
    if (sets.length > 0) dumps.push({ startedAt: s.startedAt, endedAt: s.endedAt!, ...(s.manual ? { manual: true } : {}), sets });
  }

  const payload: TransferPayload = {
    v: 1,
    createdAt: now,
    sessions: dumps,
    customExercises: await database.customExercises.toArray(),
    checkins: (await database.checkins.toArray()).filter((c) => c.date >= since).map(({ id: _id, ...c }) => (void _id, c)),
  };
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const code = canCompress() ? `GC1.${toB64url(await pipe(raw, new CompressionStream('gzip')))}` : `GC0.${toB64url(raw)}`;
  return { code, sessions: dumps.length, sets: dumps.reduce((a, s) => a + s.sets.length, 0) };
}

// ─────────────────────────────── 받기: 해독·검증

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validate(p: unknown): TransferPayload {
  if (!p || typeof p !== 'object') throw new TransferError('코드 내용이 올바르지 않습니다.');
  const t = p as Partial<TransferPayload>;
  if (t.v !== 1) throw new TransferError('지원하지 않는 코드 버전입니다. 앱을 최신으로 업데이트하세요.');
  if (!Array.isArray(t.sessions) || !Array.isArray(t.customExercises) || !Array.isArray(t.checkins)) throw new TransferError('코드 내용이 올바르지 않습니다.');

  const customIds = new Set<string>();
  for (const e of t.customExercises) {
    if (typeof e?.id !== 'string' || typeof e.name !== 'string' || !e.muscles || typeof e.muscles !== 'object') throw new TransferError('직접 만든 종목 정보가 올바르지 않습니다.');
    customIds.add(e.id);
  }
  for (const s of t.sessions) {
    if (!isNum(s?.startedAt) || !isNum(s.endedAt) || !Array.isArray(s.sets)) throw new TransferError('세션 정보가 올바르지 않습니다.');
    for (const x of s.sets) {
      if (!Array.isArray(x) || x.length !== 7 || typeof x[0] !== 'string' || !isNum(x[5])) throw new TransferError('세트 정보가 올바르지 않습니다.');
      if (!getExercise(x[0]) && !customIds.has(x[0])) throw new TransferError(`알 수 없는 종목이 있습니다: ${x[0]}`);
      try {
        validateSetValues({ weight: x[1], reps: x[2], rir: x[3] });
      } catch (err) {
        throw new TransferError(err instanceof ManualRecordError ? err.message : '세트 값이 올바르지 않습니다.');
      }
    }
  }
  for (const c of t.checkins) if (!isNum(c?.date)) throw new TransferError('컨디션 기록이 올바르지 않습니다.');
  return t as TransferPayload;
}

/** 붙여넣은 글(앞뒤에 다른 글자가 있어도 됨)에서 코드를 찾아 해독·검증 */
export async function parseTransferCode(text: string): Promise<TransferPayload> {
  const m = /GC([01])\.([A-Za-z0-9_-]+)/.exec(text);
  if (!m) throw new TransferError('전송 코드를 찾을 수 없습니다. "GC1." 로 시작하는 코드 전체를 붙여넣으세요.');
  let parsed: unknown;
  try {
    let bytes = fromB64url(m[2]!);
    if (m[1] === '1') {
      if (!canCompress()) throw new TransferError('이 브라우저는 압축 코드를 지원하지 않습니다. 브라우저를 업데이트하세요.');
      bytes = await pipe(bytes, new DecompressionStream('gzip'));
    }
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    if (err instanceof TransferError) throw err;
    throw new TransferError('코드가 손상되었거나 일부만 복사되었습니다. 코드 전체를 다시 복사하세요.');
  }
  return validate(parsed);
}

// ─────────────────────────────── 받기: 합치기

export interface MergeResult {
  addedSessions: number;
  addedSets: number;
  skippedSets: number;
  addedExercises: number;
  addedCheckins: number;
}

const setKey = (exerciseId: string, completedAt: number, weight: number, reps: number) => `${exerciseId}|${completedAt}|${weight}|${reps}`;
const dayStart = (ts: number) => new Date(ts).setHours(0, 0, 0, 0);

/** 기존 기록은 그대로 두고 새 기록만 추가. 같은 세트(종목·시각·무게·반복)는 건너뛴다 */
export async function mergeTransfer(payload: TransferPayload, database: GymDB = db): Promise<MergeResult> {
  const r: MergeResult = { addedSessions: 0, addedSets: 0, skippedSets: 0, addedExercises: 0, addedCheckins: 0 };

  await database.transaction('rw', [database.sessions, database.sets, database.customExercises, database.checkins], async () => {
    for (const e of payload.customExercises) {
      if (!(await database.customExercises.get(e.id))) {
        await database.customExercises.add({ ...e, custom: true });
        r.addedExercises++;
      }
    }

    const existing = new Set((await database.sets.toArray()).map((s) => setKey(s.exerciseId, s.completedAt, s.weight, s.reps)));
    const sessions = await database.sessions.toArray();

    for (const dump of payload.sessions) {
      const fresh = dump.sets.filter((x) => !existing.has(setKey(x[0], x[5], x[1], x[2])));
      r.skippedSets += dump.sets.length - fresh.length;
      if (fresh.length === 0) continue;

      // 직접 입력 기록은 하루 한 세션, 실제 운동 세션은 시작 시각으로 같은 세션을 찾는다
      let target: WorkoutSession | undefined = dump.manual
        ? sessions.find((s) => s.manual && dayStart(s.startedAt) === dayStart(dump.startedAt))
        : sessions.find((s) => !s.manual && s.startedAt === dump.startedAt);
      if (!target) {
        const id = await database.sessions.add({ startedAt: dump.startedAt, endedAt: dump.endedAt, ...(dump.manual ? { manual: true } : {}) });
        target = { id, startedAt: dump.startedAt, endedAt: dump.endedAt, manual: dump.manual };
        sessions.push(target);
        r.addedSessions++;
      }
      const sessionId = target.id!;
      const base = await database.sets.where('sessionId').equals(sessionId).count();
      const rows: SetLog[] = [...fresh]
        .sort((a, b) => a[5] - b[5])
        .map((x, i) => ({
          sessionId,
          exerciseId: x[0],
          order: base + i,
          weight: x[1],
          reps: x[2],
          rir: x[3],
          completedAt: x[5],
          ...(x[4] & 1 ? { warmup: true } : {}),
          rirEstimated: (x[4] & 2) !== 0,
          ...(x[6] !== null ? { restSec: x[6] } : {}),
        }));
      await database.sets.bulkAdd(rows);
      for (const x of fresh) existing.add(setKey(x[0], x[5], x[1], x[2]));
      r.addedSets += rows.length;

      const all = await database.sets.where('sessionId').equals(sessionId).toArray();
      await database.sessions.update(sessionId, {
        startedAt: Math.min(target.startedAt, ...all.map((s) => s.completedAt)),
        endedAt: Math.max(target.endedAt ?? 0, ...all.map((s) => s.completedAt)),
      });
    }

    const checkDates = new Set((await database.checkins.toArray()).map((c) => c.date));
    for (const c of payload.checkins) {
      if (checkDates.has(c.date)) continue;
      await database.checkins.add({ date: c.date, sleep: c.sleep, soreness: c.soreness, motivation: c.motivation, stress: c.stress });
      checkDates.add(c.date);
      r.addedCheckins++;
    }
  });

  await loadCustomExercises(database);
  return r;
}
