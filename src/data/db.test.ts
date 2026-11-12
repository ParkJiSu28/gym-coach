import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManualRecordError } from '../engine/records';
import { generateProgram } from '../engine/splits';
import {
  addManualEntry,
  deleteExerciseSets,
  swapExercise,
  updateSet,
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

  describe('addManualEntry — 다른 앱 기록을 손으로 입력', () => {
    const NOW = new Date(2026, 2, 10, 15).getTime();
    const day = (d: number) => new Date(2026, 2, d).getTime();
    const bench = (d: number, sets = [{ weight: 80, reps: 8 }, { weight: 80, reps: 7 }, { weight: 75, reps: 8 }]) => ({
      date: day(d),
      exerciseId: 'bench_press',
      sets,
    });

    it('완료된 manual 세션과 세트별 기록을 만들고, 휴식 시간은 비워 둠', async () => {
      await addManualEntry(bench(7), NOW, database);
      const sessions = await database.sessions.toArray();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.manual).toBe(true);
      expect(sessions[0]!.endedAt).toBeGreaterThanOrEqual(sessions[0]!.startedAt);
      const sets = (await database.sets.toArray()).sort((a, b) => a.order - b.order);
      expect(sets.map((s) => [s.weight, s.reps])).toEqual([
        [80, 8],
        [80, 7],
        [75, 8],
      ]);
      expect(sets.every((s) => s.restSec === undefined && s.rirEstimated === true)).toBe(true);
      expect(sets.map((s) => s.order)).toEqual([0, 1, 2]);
    });

    it('같은 날짜 기록은 하나의 세션으로 묶고, 다른 날짜는 분리', async () => {
      await addManualEntry(bench(7, [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }]), NOW, database);
      await addManualEntry({ date: day(7), exerciseId: 'squat', sets: [{ weight: 120, reps: 6 }, { weight: 120, reps: 6 }] }, NOW, database);
      await addManualEntry({ date: day(5), exerciseId: 'squat', sets: [{ weight: 115, reps: 6 }] }, NOW, database);
      expect(await database.sessions.count()).toBe(2);
      const day7 = (await database.sessions.toArray()).find((s) => new Date(s.startedAt).getDate() === 7)!;
      const day7Sets = await database.sets.where('sessionId').equals(day7.id!).sortBy('order');
      expect(day7Sets.map((s) => s.order)).toEqual([0, 1, 2, 3]);
      expect(new Set(day7Sets.map((s) => s.completedAt)).size).toBe(4);
      expect(day7.endedAt).toBe(Math.max(...day7Sets.map((s) => s.completedAt)));
    });

    it('라이브 세션이 열려 있어도 별도의 manual 세션에 저장', async () => {
      const live = await startSession({}, database);
      await addManualEntry(bench(7), NOW, database);
      const manual = (await database.sessions.toArray()).find((s) => s.manual)!;
      expect(manual.id).not.toBe(live);
      expect(await database.sets.where('sessionId').equals(live).count()).toBe(0);
    });

    it('잘못된 입력은 저장하지 않고 오류', async () => {
      await expect(addManualEntry(bench(11), NOW, database)).rejects.toThrow(ManualRecordError);
      expect(await database.sessions.count()).toBe(0);
      expect(await database.sets.count()).toBe(0);
    });

    it('입력한 종목 기록 삭제 — 세트가 없으면 세션도 삭제', async () => {
      await addManualEntry(bench(7), NOW, database);
      await addManualEntry({ date: day(7), exerciseId: 'squat', sets: [{ weight: 120, reps: 6 }] }, NOW, database);
      const sid = (await database.sessions.toArray())[0]!.id!;
      await deleteExerciseSets(sid, 'bench_press', database);
      expect(await database.sets.count()).toBe(1);
      await deleteExerciseSets(sid, 'squat', database);
      expect(await database.sessions.count()).toBe(0);
    });
  });

  describe('updateSet — 기록한 세트 수정', () => {
    it('무게·반복·RIR 수정, RIR 을 입력하면 추정 표시 해제', async () => {
      await addManualEntry({ date: new Date(2026, 2, 7).getTime(), exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] }, new Date(2026, 2, 10).getTime(), database);
      const s = (await database.sets.toArray())[0]!;
      await updateSet(s.id!, { weight: 105, reps: 6, rir: 1 }, database);
      expect(await database.sets.get(s.id!)).toMatchObject({ weight: 105, reps: 6, rir: 1, rirEstimated: false });
    });

    it('잘못된 값은 거부', async () => {
      const sid = await startSession({}, database);
      const id = await logSet({ sessionId: sid, exerciseId: 'squat', weight: 100, reps: 5, rir: 2 }, database);
      await expect(updateSet(id, { reps: 0 }, database)).rejects.toThrow(/반복/);
      await expect(updateSet(id, { weight: -5 }, database)).rejects.toThrow(/무게/);
      await expect(updateSet(9999, { reps: 5 }, database)).rejects.toThrow(/찾을 수 없/);
    });
  });

  describe('swapExercise — 운동 중 종목 교체', () => {
    it('세션에 교체 내역 저장, 같은 종목을 다시 교체하면 원래 계획 기준으로 덮어씀', async () => {
      const sid = await startSession({}, database);
      await swapExercise(sid, 'bench_press', 'smith_bench', database);
      expect((await database.sessions.get(sid))!.swaps).toEqual({ bench_press: 'smith_bench' });
      await swapExercise(sid, 'bench_press', 'db_bench', database);
      expect((await database.sessions.get(sid))!.swaps).toEqual({ bench_press: 'db_bench' });
    });

    it('원래 종목으로 되돌리면 교체 내역 삭제', async () => {
      const sid = await startSession({}, database);
      await swapExercise(sid, 'bench_press', 'smith_bench', database);
      await swapExercise(sid, 'bench_press', 'bench_press', database);
      expect((await database.sessions.get(sid))!.swaps).toEqual({});
    });
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
