import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateProgram } from '../engine/splits';
import {
  BackupError,
  deleteSession,
  exportAll,
  finishSession,
  GymDB,
  importAll,
  logSet,
  saveActiveProgram,
  startSession,
  validateBackup,
} from './db';

let database: GymDB;
let n = 0;

beforeEach(async () => {
  database = new GymDB(`test-${n++}`);
  await database.open();
});
afterEach(async () => {
  await database.delete();
});

describe('db', () => {
  it('열린 세션이 있으면 재사용, 빈 세션은 종료 시 삭제', async () => {
    const a = await startSession({}, database);
    const b = await startSession({}, database);
    expect(a).toBe(b);
    await finishSession(a, database);
    expect(await database.sessions.count()).toBe(0);
  });

  it('세트 기록 시 순서·휴식 시간 자동 계산', async () => {
    const sid = await startSession({}, database);
    await logSet({ sessionId: sid, exerciseId: 'bench_press', weight: 100, reps: 8, rir: 2, completedAt: 1_000_000 }, database);
    await logSet({ sessionId: sid, exerciseId: 'bench_press', weight: 100, reps: 8, rir: 2, completedAt: 1_150_000 }, database);
    const sets = await database.sets.orderBy('completedAt').toArray();
    expect(sets.map((s) => s.order)).toEqual([0, 1]);
    expect(sets[0]!.restSec).toBeUndefined();
    expect(sets[1]!.restSec).toBe(150);
    await finishSession(sid, database);
    expect((await database.sessions.get(sid))!.endedAt).toBeDefined();
    await deleteSession(sid, database);
    expect(await database.sets.count()).toBe(0);
  });

  it('활성 프로그램은 하나만', async () => {
    const p = generateProgram({ daysPerWeek: 4, sessionMinutes: 60, priorities: [] });
    await saveActiveProgram(p, database);
    await saveActiveProgram(p, database);
    const all = await database.programs.toArray();
    expect(all.filter((x) => x.active)).toHaveLength(1);
  });

  it('백업 내보내기 → 가져오기 왕복', async () => {
    const sid = await startSession({}, database);
    await logSet({ sessionId: sid, exerciseId: 'squat', weight: 120, reps: 6, rir: 1 }, database);
    await database.checkins.add({ date: 1, sleep: 4, soreness: 3, motivation: 5, stress: 4 });
    const backup = JSON.parse(JSON.stringify(await exportAll(database)));
    await database.sets.clear();
    await importAll(backup, database);
    expect(await database.sets.count()).toBe(1);
    expect(await database.checkins.count()).toBe(1);
  });

  it('잘못된 백업 거부', () => {
    expect(() => validateBackup(null)).toThrow(BackupError);
    expect(() => validateBackup({ version: 2 })).toThrow(/버전/);
    expect(() => validateBackup({ version: 1, sessions: [] })).toThrow(/sets/);
    const base = { version: 1, sessions: [], sets: [], checkins: [], programs: [], customExercises: [] };
    expect(() => validateBackup({ ...base, sets: [{ sessionId: 1, exerciseId: 'x', weight: 'heavy' }] })).toThrow(/세트/);
    expect(() => validateBackup({ ...base, sessions: [{ startedAt: 1 }] })).toThrow(/세션/);
    expect(validateBackup(base).version).toBe(1);
  });
});
