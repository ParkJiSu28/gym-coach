import Dexie, { type Table } from 'dexie';
import { registerCustomExercises } from '../domain/exercises';
import type { Checkin, Exercise, Program, SetLog, WorkoutSession } from '../domain/types';

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

// ─────────────────────────────── 프로그램

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
