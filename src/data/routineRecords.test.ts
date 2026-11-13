import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseRoutineText } from '../engine/routineImport';
import { GymDB, saveRoutineRecords } from './db';

let database: GymDB;
let n = 0;
const NOW = new Date(2026, 10, 13, 20).getTime();
const day = (d: number) => new Date(2026, 10, d).getTime();

beforeEach(async () => {
  database = new GymDB(`routine-records-${n++}`);
  await database.open();
});
afterEach(async () => {
  await database.delete();
});

describe('saveRoutineRecords — 분석한 루틴을 운동 기록으로', () => {
  const days = parseRoutineText('상체A 루틴 (바벨로우 20*20,40*15,60*10,60*7 4세트, 벤치프레스 50*8 3세트) 하체A 루틴 (데드리프트 80*6 2세트, 외계인운동 10*10 3세트)');

  it('루틴마다 고른 날짜에 본세트만 저장 (워밍업·모르는 종목 제외)', async () => {
    const r = await saveRoutineRecords(days, [day(10), day(11)], NOW, database);
    expect(r).toEqual({ sessions: 2, sets: 3 + 3 + 2 });
    const sets = await database.sets.toArray();
    expect(sets.filter((s) => s.exerciseId === 'barbell_row').map((s) => s.weight)).toEqual([40, 60, 60]);
    const sessions = (await database.sessions.toArray()).sort((a, b) => a.startedAt - b.startedAt);
    expect(sessions.map((s) => new Date(s.startedAt).getDate())).toEqual([10, 11]);
    expect(sessions.every((s) => s.manual)).toBe(true);
  });

  it('RIR 은 모름(추정)으로 저장', async () => {
    await saveRoutineRecords(days, [day(10), day(11)], NOW, database);
    expect((await database.sets.toArray()).every((s) => s.rirEstimated)).toBe(true);
  });

  it('날짜를 비운 루틴은 건너뜀', async () => {
    const r = await saveRoutineRecords(days, [day(10), null], NOW, database);
    expect(r.sessions).toBe(1);
  });

  it('미래 날짜는 거부', async () => {
    await expect(saveRoutineRecords(days, [day(20), null], NOW, database)).rejects.toThrow();
  });
});
