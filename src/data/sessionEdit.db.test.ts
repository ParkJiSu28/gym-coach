import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getExercise } from '../domain/exercises';
import { parseRoutinePlan, planToProgram } from '../engine/claudeBridge';
import { generateProgram } from '../engine/splits';
import { addManualEntry, addSessionExercise, cancelSession, changeSessionDay, removeSessionExercise, createCustomExercise, GymDB, logSet, saveActiveProgram, setSessionOrder, setSessionRest, startSession } from './db';

let database: GymDB;
let n = 0;
beforeEach(async () => {
  database = new GymDB(`session-edit-${n++}`);
  await database.open();
});
afterEach(async () => {
  await database.delete();
});

describe('운동 중 순서·휴식 저장', () => {
  it('세션에 종목 순서와 종목별 휴식을 저장 (세트 기록은 그대로)', async () => {
    const sid = await startSession({}, database);
    await logSet({ sessionId: sid, exerciseId: 'bench_press', weight: 60, reps: 8, rir: 2, rirEstimated: true }, database);
    await setSessionOrder(sid, ['lat_pulldown', 'bench_press'], database);
    await setSessionRest(sid, 'bench_press', 95, database);
    await setSessionRest(sid, 'lat_pulldown', 5, database);
    const s = await database.sessions.get(sid);
    expect(s?.order).toEqual(['lat_pulldown', 'bench_press']);
    expect(s?.rest).toEqual({ bench_press: 95, lat_pulldown: 30 });
    expect(await database.sets.count()).toBe(1);
  });
});

describe('목록에 없는 종목 직접 추가', () => {
  it('이름으로 만들고, 같은 이름이면 기존 것을 다시 씀', async () => {
    const id = await createCustomExercise({ name: ' 나만의 힙 머신 ', muscle: 'glutes', compound: true }, database);
    expect(getExercise(id)?.name).toBe('나만의 힙 머신');
    expect(getExercise(id)?.muscles.glutes).toBe(1);
    expect(await createCustomExercise({ name: '나만의 힙 머신', muscle: 'glutes', compound: true }, database)).toBe(id);
    expect(await database.customExercises.count()).toBe(1);
  });
  it('기본 목록에 있는 이름이면 그 종목 id', async () => {
    expect(await createCustomExercise({ name: '바벨 벤치프레스', muscle: 'chest', compound: true }, database)).toBe('bench_press');
  });
});

describe('AI 피드백으로 받은 새 루틴 적용 — 기존 기록은 그대로', () => {
  it('Claude 루틴을 저장해도 지난 세션·세트는 하나도 안 지워지고, 이전 루틴은 비활성으로 남음', async () => {
    await saveActiveProgram(generateProgram({ daysPerWeek: 4, sessionMinutes: 60, priorities: [] }), database);
    const now = Date.now();
    await addManualEntry({ date: now - 2 * 86_400_000, exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 7 }] }, now, database);
    const before = { sessions: await database.sessions.count(), sets: await database.sets.count() };

    const plan = parseRoutinePlan('### 상체A\n- 바벨 벤치프레스 | 4세트 | 6-10회 | 62.5kg | 휴식 150초');
    await saveActiveProgram(planToProgram(plan, now), database);

    expect(await database.sessions.count()).toBe(before.sessions);
    expect(await database.sets.count()).toBe(before.sets);
    const programs = await database.programs.toArray();
    expect(programs).toHaveLength(2);
    expect(programs.filter((p) => p.active).map((p) => p.source)).toEqual(['imported']);
  });
});

describe('운동 중 종목 추가·삭제', () => {
  it('추가한 종목은 세션에 저장돼 화면을 나갔다 와도 남음 (중복 없이)', async () => {
    const sid = await startSession({}, database);
    await addSessionExercise(sid, 'lat_pulldown', database);
    await addSessionExercise(sid, 'lat_pulldown', database);
    await addSessionExercise(sid, 'bench_press', database);
    expect((await database.sessions.get(sid))?.added).toEqual(['lat_pulldown', 'bench_press']);
  });
  it('삭제하면 그 종목 세트만 지우고 세션과 다른 종목 기록은 그대로', async () => {
    const sid = await startSession({}, database);
    await logSet({ sessionId: sid, exerciseId: 'bench_press', weight: 60, reps: 8, rir: 2, rirEstimated: false }, database);
    await logSet({ sessionId: sid, exerciseId: 'lat_pulldown', weight: 50, reps: 10, rir: 2, rirEstimated: false }, database);
    await addSessionExercise(sid, 'lat_pulldown', database);
    await setSessionOrder(sid, ['lat_pulldown', 'bench_press'], database);
    await removeSessionExercise(sid, 'lat_pulldown', database);
    const s = await database.sessions.get(sid);
    expect(s).toBeDefined();
    expect(s?.added).toEqual([]);
    expect(s?.removed).toEqual(['lat_pulldown']);
    expect(s?.order).toEqual(['bench_press']);
    expect((await database.sets.toArray()).map((x) => x.exerciseId)).toEqual(['bench_press']);
  });
  it('삭제했던 종목을 다시 추가하면 다시 보임', async () => {
    const sid = await startSession({}, database);
    await removeSessionExercise(sid, 'squat', database);
    await addSessionExercise(sid, 'squat', database);
    const s = await database.sessions.get(sid);
    expect(s?.removed).toEqual([]);
    expect(s?.added).toEqual(['squat']);
  });
});

describe('잘못 시작한 운동 되돌리기', () => {
  it('세트가 없으면 시작 취소 = 세션 삭제', async () => {
    const sid = await startSession({ programId: 1, dayId: 'a' }, database);
    await cancelSession(sid, database);
    expect(await database.sessions.count()).toBe(0);
  });
  it('세트가 있으면 시작 취소는 거부 (기록 보호)', async () => {
    const sid = await startSession({}, database);
    await logSet({ sessionId: sid, exerciseId: 'bench_press', weight: 60, reps: 8, rir: 2, rirEstimated: false }, database);
    await expect(cancelSession(sid, database)).rejects.toThrow();
    expect(await database.sets.count()).toBe(1);
  });
  it('다른 루틴으로 바꾸면 세트는 그대로, 순서·교체·뺀 종목은 초기화', async () => {
    const sid = await startSession({ programId: 1, dayId: 'a' }, database);
    await logSet({ sessionId: sid, exerciseId: 'bench_press', weight: 60, reps: 8, rir: 2, rirEstimated: false }, database);
    await setSessionOrder(sid, ['x'], database);
    await removeSessionExercise(sid, 'squat', database);
    await changeSessionDay(sid, { programId: 1, dayId: 'b' }, database);
    const s = await database.sessions.get(sid);
    expect(s?.dayId).toBe('b');
    expect(s?.order).toBeUndefined();
    expect(s?.removed).toBeUndefined();
    expect(await database.sets.count()).toBe(1);
  });
});
