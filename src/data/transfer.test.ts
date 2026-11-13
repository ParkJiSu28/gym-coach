import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addManualEntry, finishSession, GymDB, logSet, startSession } from './db';
import { createTransferCode, mergeTransfer, parseTransferCode, TransferError } from './transfer';

// PC 와 폰을 서로 다른 IndexedDB 로 재현
let pc: GymDB;
let phone: GymDB;
let n = 0;
const NOW = new Date(2026, 10, 13, 20).getTime();
const day = (d: number) => new Date(2026, 10, d).getTime();

beforeEach(async () => {
  pc = new GymDB(`pc-${n}`);
  phone = new GymDB(`phone-${n++}`);
  await Promise.all([pc.open(), phone.open()]);
});
afterEach(async () => {
  await Promise.all([pc.delete(), phone.delete()]);
});

async function seedPc() {
  await addManualEntry({ date: day(10), exerciseId: 'bench_press', sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 7, rir: 1 }] }, NOW, pc);
  await addManualEntry({ date: day(10), exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] }, NOW, pc);
  await addManualEntry({ date: day(3), exerciseId: 'lateral_raise', sets: [{ weight: 8, reps: 15 }] }, NOW, pc);
}

describe('createTransferCode / parseTransferCode', () => {
  it('한 줄짜리 코드(GC 접두사)로 만들고 다시 읽을 수 있음', async () => {
    await seedPc();
    const { code, sessions, sets } = await createTransferCode({ now: NOW }, pc);
    expect(code).toMatch(/^GC[01]\.[A-Za-z0-9_-]+$/);
    expect([sessions, sets]).toEqual([2, 4]);
    const payload = await parseTransferCode(code);
    expect(payload.sessions.flatMap((s) => s.sets)).toHaveLength(4);
  });

  it('카톡 등에서 앞뒤에 다른 글자·줄바꿈이 붙어도 코드를 찾아냄', async () => {
    await seedPc();
    const { code } = await createTransferCode({ now: NOW }, pc);
    const payload = await parseTransferCode(`나와의 채팅\n오후 8:01\n  ${code}  \n`);
    expect(payload.sessions).toHaveLength(2);
  });

  it('진행 중(종료 안 된) 세션은 보내지 않음', async () => {
    await seedPc();
    const sid = await startSession({}, pc);
    await logSet({ sessionId: sid, exerciseId: 'bench_press', weight: 60, reps: 10, rir: 2 }, pc);
    const { sessions } = await createTransferCode({ now: NOW }, pc);
    expect(sessions).toBe(2);
  });

  it('범위 지정: 최근 7일만', async () => {
    await seedPc();
    const { sessions, sets } = await createTransferCode({ now: NOW, sinceDays: 7 }, pc);
    expect([sessions, sets]).toEqual([1, 3]);
  });

  it('기록 200세트도 압축되어 원본 JSON 보다 짧음', async () => {
    for (let d = 1; d <= 20; d++) {
      await addManualEntry({ date: day(d), exerciseId: 'bench_press', sets: Array.from({ length: 10 }, () => ({ weight: 80, reps: 8 })) }, NOW, pc);
    }
    const { code, sets } = await createTransferCode({ now: NOW }, pc);
    expect(sets).toBe(200);
    expect(code.length).toBeLessThan(6000);
  });

  it.each([
    ['빈 문자열', ''],
    ['코드 아님', '안녕하세요'],
    ['깨진 코드', 'GC1.@@@@'],
    ['잘린 코드', 'GC0.eyJ2IjoxLCJzZXNz'],
  ])('%s → TransferError', async (_l, code) => {
    await expect(parseTransferCode(code)).rejects.toThrow(TransferError);
  });

  it('형식은 맞지만 값이 잘못된 코드 거부', async () => {
    const bad = { v: 1, createdAt: 0, sessions: [{ startedAt: 1, endedAt: 2, sets: [['bench_press', -5, 8, 2, 0, 1, null]] }], customExercises: [], checkins: [] };
    const code = 'GC0.' + btoa(unescape(encodeURIComponent(JSON.stringify(bad)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(parseTransferCode(code)).rejects.toThrow(/무게/);
  });
});

describe('mergeTransfer — 폰 기록에 합치기', () => {
  it('PC 기록이 폰에 그대로 들어감 (무게·반복·RIR·추정 여부·날짜)', async () => {
    await seedPc();
    const { code } = await createTransferCode({ now: NOW }, pc);
    const r = await mergeTransfer(await parseTransferCode(code), phone);
    expect(r).toMatchObject({ addedSets: 4, skippedSets: 0 });
    const sets = (await phone.sets.toArray()).sort((a, b) => a.completedAt - b.completedAt);
    const bench = sets.filter((s) => s.exerciseId === 'bench_press');
    expect(bench.map((s) => [s.weight, s.reps, s.rir, s.rirEstimated])).toEqual([
      [80, 8, 2, true],
      [80, 7, 1, false],
    ]);
    expect(new Date(bench[0]!.completedAt).getDate()).toBe(10);
    const sessions = await phone.sessions.toArray();
    expect(sessions.every((s) => s.manual && s.endedAt)).toBe(true);
  });

  it('폰에 있던 기록은 지우지 않고 합침', async () => {
    await addManualEntry({ date: day(12), exerciseId: 'deadlift', sets: [{ weight: 140, reps: 5 }] }, NOW, phone);
    await seedPc();
    await mergeTransfer(await parseTransferCode((await createTransferCode({ now: NOW }, pc)).code), phone);
    expect(await phone.sets.count()).toBe(5);
  });

  it('같은 코드를 두 번 받아도 중복 없음', async () => {
    await seedPc();
    const payload = await parseTransferCode((await createTransferCode({ now: NOW }, pc)).code);
    await mergeTransfer(payload, phone);
    const again = await mergeTransfer(payload, phone);
    expect(again).toMatchObject({ addedSets: 0, skippedSets: 4, addedSessions: 0 });
    expect(await phone.sets.count()).toBe(4);
    expect(await phone.sessions.count()).toBe(2);
  });

  it('같은 날짜의 직접 입력 기록은 폰의 기존 세션에 합쳐짐 (하루 한 세션)', async () => {
    await addManualEntry({ date: day(10), exerciseId: 'deadlift', sets: [{ weight: 140, reps: 5 }] }, NOW, phone);
    await seedPc();
    await mergeTransfer(await parseTransferCode((await createTransferCode({ now: NOW }, pc)).code), phone);
    const day10 = (await phone.sessions.toArray()).filter((s) => new Date(s.startedAt).getDate() === 10);
    expect(day10).toHaveLength(1);
    expect(await phone.sets.where('sessionId').equals(day10[0]!.id!).count()).toBe(4);
  });

  it('PC 에서 실제로 운동한(라이브) 세션도 옮겨짐, 휴식 시간 유지', async () => {
    const sid = await startSession({}, pc);
    await logSet({ sessionId: sid, exerciseId: 'bench_press', weight: 60, reps: 10, rir: 2, completedAt: NOW - 600_000 }, pc);
    await logSet({ sessionId: sid, exerciseId: 'bench_press', weight: 60, reps: 9, rir: 1, completedAt: NOW - 450_000 }, pc);
    await finishSession(sid, pc);
    await mergeTransfer(await parseTransferCode((await createTransferCode({ now: NOW }, pc)).code), phone);
    const s = await phone.sessions.toArray();
    expect(s).toHaveLength(1);
    expect(s[0]!.manual).toBeFalsy();
    const sets = (await phone.sets.toArray()).sort((a, b) => a.order - b.order);
    expect(sets.map((x) => x.restSec)).toEqual([undefined, 150]);
  });

  it('직접 만든 종목과 컨디션 체크인도 옮겨지고 중복되지 않음', async () => {
    await pc.customExercises.add({ id: 'custom_1', name: '내 종목', equipment: 'machine', compound: false, muscles: { biceps: 1 }, increment: 2.5, custom: true });
    await addManualEntry({ date: day(10), exerciseId: 'bench_press', sets: [{ weight: 80, reps: 8 }] }, NOW, pc);
    await pc.checkins.add({ date: day(10), sleep: 4, soreness: 3, motivation: 5, stress: 4 });
    const payload = await parseTransferCode((await createTransferCode({ now: NOW }, pc)).code);
    const r1 = await mergeTransfer(payload, phone);
    await mergeTransfer(payload, phone);
    expect(r1).toMatchObject({ addedExercises: 1, addedCheckins: 1 });
    expect(await phone.customExercises.count()).toBe(1);
    expect(await phone.checkins.count()).toBe(1);
  });
});
