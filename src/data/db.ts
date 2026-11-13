import Dexie, { type Table } from 'dexie';
import { getExercise, registerCustomExercises } from '../domain/exercises';
import { workingSets, type RoutineDay } from '../engine/routineImport';
import type { Checkin, Exercise, Program, SetLog, WorkoutSession } from '../domain/types';
import {
  DEFAULT_UNKNOWN_RIR,
  ManualRecordError,
  manualSetTimes,
  validateManualEntry,
  validateSetValues,
  type ManualEntry,
} from '../engine/records';

export class GymDB extends Dexie {
  sessions!: Table<WorkoutSession, number>;
  sets!: Table<SetLog, number>;
  checkins!: Table<Checkin, number>;
  programs!: Table<Program, number>;
  customExercises!: Table<Exercise, string>;

  constructor(name = 'gym-coach') {
    super(name);
    this.version(1).stores({
      sessions: '++id, startedAt, endedAt, programId',
      sets: '++id, sessionId, exerciseId, completedAt',
      checkins: '++id, date',
      programs: '++id, createdAt',
      customExercises: 'id',
    });
  }
}

export const db = new GymDB();

export async function loadCustomExercises(database: GymDB = db): Promise<void> {
  registerCustomExercises(await database.customExercises.toArray());
}

// ─────────────────────────────── 세션·세트

export async function startSession(
  init: Pick<WorkoutSession, 'programId' | 'dayId'> = {},
  database: GymDB = db,
): Promise<number> {
  const open = await database.sessions.filter((s) => !s.endedAt).first();
  if (open?.id) return open.id;
  return database.sessions.add({ startedAt: Date.now(), ...init });
}

export async function finishSession(id: number, database: GymDB = db): Promise<void> {
  const count = await database.sets.where('sessionId').equals(id).count();
  if (count === 0) {
    await database.sessions.delete(id);
    return;
  }
  await database.sessions.update(id, { endedAt: Date.now() });
}

export async function logSet(
  input: Omit<SetLog, 'id' | 'order' | 'completedAt' | 'restSec'> & { completedAt?: number },
  database: GymDB = db,
): Promise<number> {
  const completedAt = input.completedAt ?? Date.now();
  const inSession = await database.sets.where('sessionId').equals(input.sessionId).sortBy('completedAt');
  const prev = inSession.at(-1);
  const restSec = prev ? Math.round((completedAt - prev.completedAt) / 1000) : undefined;
  return database.sets.add({ ...input, completedAt, order: inSession.length, restSec });
}

export async function deleteSession(id: number, database: GymDB = db): Promise<void> {
  await database.transaction('rw', database.sessions, database.sets, async () => {
    await database.sets.where('sessionId').equals(id).delete();
    await database.sessions.delete(id);
  });
}

// ─────────────────────────────── 직접 입력 · 수정 · 교체

/** 다른 앱 기록을 손으로 입력: 같은 날짜는 하나의 manual 세션으로 묶는다 */
export async function addManualEntry(entry: ManualEntry, now = Date.now(), database: GymDB = db): Promise<number> {
  const v = validateManualEntry(entry, now);
  const dayStart = new Date(v.date).setHours(0, 0, 0, 0);
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  return database.transaction('rw', database.sessions, database.sets, async () => {
    let session = await database.sessions
      .where('startedAt')
      .between(dayStart, dayEnd, true, false)
      .filter((s) => s.manual === true)
      .first();
    const existing = session?.id ? await database.sets.where('sessionId').equals(session.id).count() : 0;
    const times = manualSetTimes(v.date, v.sets.length, now, existing);

    if (!session?.id) {
      const id = await database.sessions.add({ startedAt: times[0]!, endedAt: times.at(-1)!, manual: true });
      session = { id, startedAt: times[0]!, manual: true };
    }
    const sessionId = session.id!;
    await database.sets.bulkAdd(
      v.sets.map((s, i) => ({
        sessionId,
        exerciseId: v.exerciseId,
        order: existing + i,
        weight: s.weight,
        reps: s.reps,
        rir: s.rir,
        rirEstimated: s.rirEstimated,
        completedAt: times[i]!,
      })),
    );
    const all = await database.sets.where('sessionId').equals(sessionId).toArray();
    await database.sessions.update(sessionId, {
      startedAt: Math.min(...all.map((s) => s.completedAt)),
      endedAt: Math.max(...all.map((s) => s.completedAt)),
    });
    return sessionId;
  });
}

/** 세션에서 한 종목의 세트를 모두 삭제. 남은 세트가 없으면 세션도 삭제 */
export async function deleteExerciseSets(sessionId: number, exerciseId: string, database: GymDB = db): Promise<void> {
  await database.transaction('rw', database.sessions, database.sets, async () => {
    await database.sets.where('sessionId').equals(sessionId).filter((s) => s.exerciseId === exerciseId).delete();
    if ((await database.sets.where('sessionId').equals(sessionId).count()) === 0) await database.sessions.delete(sessionId);
  });
}

/** 기록한 세트 수정. RIR 을 입력하면 "추정" 표시를 해제한다 */
export async function updateSet(id: number, patch: { weight?: number; reps?: number; rir?: number | null }, database: GymDB = db): Promise<void> {
  validateSetValues(patch);
  const cur = await database.sets.get(id);
  if (!cur) throw new ManualRecordError('세트를 찾을 수 없습니다.');
  const next: Partial<SetLog> = {};
  if (patch.weight !== undefined) next.weight = patch.weight;
  if (patch.reps !== undefined) next.reps = patch.reps;
  if (patch.rir === null) {
    next.rir = DEFAULT_UNKNOWN_RIR;
    next.rirEstimated = true;
  } else if (patch.rir !== undefined) {
    next.rir = patch.rir;
    next.rirEstimated = false;
  }
  await database.sets.update(id, next);
}

/** 운동 중 종목 교체: 계획 종목(from) → 실제 종목(to). to === from 이면 교체 취소 */
export async function swapExercise(sessionId: number, from: string, to: string, database: GymDB = db): Promise<void> {
  const s = await database.sessions.get(sessionId);
  if (!s) throw new Error('세션을 찾을 수 없습니다.');
  const swaps = { ...(s.swaps ?? {}) };
  if (from === to) delete swaps[from];
  else swaps[from] = to;
  await database.sessions.update(sessionId, { swaps });
}

// ─────────────────────────────── 프로그램

/**
 * 분석한 루틴을 운동 기록으로 저장: 루틴마다 고른 날짜에 본세트(워밍업 제외)만, RIR 은 모름(추정).
 * 날짜가 null 인 루틴과 앱에 없는 종목은 건너뛴다. 하나라도 잘못되면 아무것도 저장하지 않는다.
 */
export async function saveRoutineRecords(
  days: RoutineDay[],
  dates: (number | null)[],
  now = Date.now(),
  database: GymDB = db,
): Promise<{ sessions: number; sets: number }> {
  const jobs: { day: number; entry: ManualEntry }[] = [];
  days.forEach((d, i) => {
    const date = dates[i];
    if (date === null || date === undefined) return;
    for (const e of d.entries) {
      if (!e.exerciseId || !getExercise(e.exerciseId) || e.added) continue;
      const work = workingSets(e.sets).filter((s) => s.weight > 0 || getExercise(e.exerciseId!)!.equipment === 'bodyweight');
      if (work.length) jobs.push({ day: i, entry: { date, exerciseId: e.exerciseId, sets: work.map((s) => ({ weight: s.weight, reps: s.reps })) } });
    }
  });
  for (const j of jobs) validateManualEntry(j.entry, now);
  for (const j of jobs) await addManualEntry(j.entry, now, database);
  return { sessions: new Set(jobs.map((j) => j.day)).size, sets: jobs.reduce((a, j) => a + j.entry.sets.length, 0) };
}

export async function saveActiveProgram(p: Program, database: GymDB = db): Promise<number> {
  return database.transaction('rw', database.programs, async () => {
    await database.programs.toCollection().modify({ active: false });
    const rest: Program = { ...p, active: true };
    delete rest.id;
    return database.programs.add(rest);
  });
}

// ─────────────────────────────── 백업

export interface Backup {
  version: 1;
  exportedAt: number;
  sessions: WorkoutSession[];
  sets: SetLog[];
  checkins: Checkin[];
  programs: Program[];
  customExercises: Exercise[];
}

export async function exportAll(database: GymDB = db): Promise<Backup> {
  return {
    version: 1,
    exportedAt: Date.now(),
    sessions: await database.sessions.toArray(),
    sets: await database.sets.toArray(),
    checkins: await database.checkins.toArray(),
    programs: await database.programs.toArray(),
    customExercises: await database.customExercises.toArray(),
  };
}

export class BackupError extends Error {}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateBackup(raw: unknown): Backup {
  if (!raw || typeof raw !== 'object') throw new BackupError('백업 파일 형식이 아닙니다.');
  const b = raw as Partial<Backup>;
  if (b.version !== 1) throw new BackupError(`지원하지 않는 백업 버전: ${String(b.version)}`);
  for (const k of ['sessions', 'sets', 'checkins', 'programs', 'customExercises'] as const) {
    if (!Array.isArray(b[k])) throw new BackupError(`'${k}' 항목이 없거나 배열이 아닙니다.`);
  }
  for (const s of b.sets!) {
    if (!isNum(s.sessionId) || typeof s.exerciseId !== 'string' || !isNum(s.weight) || !isNum(s.reps) || !isNum(s.rir) || !isNum(s.completedAt)) {
      throw new BackupError('세트 기록 중 잘못된 항목이 있습니다.');
    }
  }
  for (const s of b.sessions!) {
    if (!isNum(s.id) || !isNum(s.startedAt)) throw new BackupError('세션 기록 중 잘못된 항목이 있습니다.');
  }
  return b as Backup;
}

/** 기존 데이터를 모두 지우고 백업으로 교체 */
export async function importAll(raw: unknown, database: GymDB = db): Promise<void> {
  const b = validateBackup(raw);
  const tables = [database.sessions, database.sets, database.checkins, database.programs, database.customExercises];
  await database.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await database.sessions.bulkAdd(b.sessions);
    await database.sets.bulkAdd(b.sets);
    await database.checkins.bulkAdd(b.checkins);
    await database.programs.bulkAdd(b.programs);
    await database.customExercises.bulkAdd(b.customExercises);
  });
  registerCustomExercises(b.customExercises);
}
