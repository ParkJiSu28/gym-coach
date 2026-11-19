import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getExercise } from '../domain/exercises';
import { parseRoutinePlan, planToProgram } from '../engine/claudeBridge';
import { generateProgram } from '../engine/splits';
import { addManualEntry, createCustomExercise, GymDB, logSet, saveActiveProgram, setSessionOrder, setSessionRest, startSession } from './db';

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
