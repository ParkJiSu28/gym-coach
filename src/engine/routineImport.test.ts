import SAMPLE from './__fixtures__/routine-sample.txt?raw';
import { describe, expect, it } from 'vitest';
import { auditRoutine, nextTarget, parseRoutineText, routineToProgram, workingSets } from './routineImport';
import { programWeeklyVolume } from './splits';

const pairs = (sets: { weight: number; reps: number }[]) => sets.map((s) => `${s.weight}x${s.reps}`);

describe('parseRoutineText — 한 줄 루틴 글', () => {
  const days = parseRoutineText(SAMPLE);
  const day = (name: string) => days.find((d) => d.name === name)!;
  const entry = (dayName: string, id: string) => day(dayName).entries.find((e) => e.exerciseId === id)!;

  it('루틴 4개(상체A·하체A·상체B·하체B)로 나눔', () => {
    expect(days.map((d) => d.name)).toEqual(['상체A', '하체A', '상체B', '하체B']);
  });

  it('모든 종목을 앱 종목으로 인식', () => {
    const unmatched = days.flatMap((d) => d.entries.filter((e) => !e.exerciseId).map((e) => e.rawName));
    expect(unmatched).toEqual([]);
  });

  it('종목 순서와 인식 결과 (상체A)', () => {
    expect(day('상체A').entries.map((e) => e.exerciseId)).toEqual([
      'db_pullover', 'pec_deck', 'bench_press', 'smith_bench', 'assisted_dip', 'assisted_pull_up', 'face_pull', 'lat_pulldown', 'machine_lateral_raise',
    ]);
  });

  it('하체·슈퍼세트 종목 인식', () => {
    expect(day('하체A').entries.map((e) => e.exerciseId)).toEqual([
      'hip_abduction', 'hip_adduction', 'leg_extension', 'machine_hip_thrust', 'smith_squat', 'pendulum_squat', 'rdl', 'calf_press', 'lying_leg_curl',
      'triceps_pushdown', 'preacher_curl', 'overhead_triceps_ext', 'cable_hammer_curl',
    ]);
    expect(day('상체B').entries.map((e) => e.exerciseId)).toContain('high_row');
    expect(day('상체B').entries.map((e) => e.exerciseId)).toContain('low_row');
    expect(day('상체B').entries.map((e) => e.exerciseId)).toContain('straight_arm_pulldown');
    expect(day('하체B').entries.map((e) => e.exerciseId)).toEqual([
      'machine_hip_thrust', 'deadlift', 'hack_squat', 'bulgarian_split_squat', 'lying_leg_curl', 'calf_press', 'overhead_triceps_ext', 'cable_hammer_curl',
    ]);
  });

  it('세트별 무게×반복', () => {
    expect(pairs(entry('상체A', 'pec_deck').sets)).toEqual(['45x15', '50x15', '55x10']);
    expect(pairs(entry('하체A', 'hip_adduction').sets)).toEqual(['37.5x10', '37.5x10', '37.5x7']);
    // "57.5,8" 오타도 57.5×8 로
    expect(pairs(entry('하체A', 'triceps_pushdown').sets)).toEqual(['45x10', '50x10', '57.5x8', '57.5x7']);
  });

  it('"50*8 5세트" 처럼 한 값 + N세트 는 N번 반복', () => {
    expect(pairs(entry('상체A', 'bench_press').sets)).toEqual(Array(5).fill('50x8'));
    expect(pairs(entry('상체B', 'assisted_dip').sets)).toEqual(Array(5).fill('20.4x8'));
  });

  it('쉼표 없이 이어진 종목도 나눔 (하이로우 … 스미스 벤치 … 어시스트 딥스)', () => {
    expect(pairs(entry('상체B', 'high_row').sets)).toEqual(['60x10', '70x10', '70x8', '70x7']);
    expect(pairs(entry('상체B', 'smith_bench').sets)).toEqual(Array(5).fill('55x10'));
  });

  it('루틴 이름이 없으면 한 덩어리', () => {
    const d = parseRoutineText('벤치프레스 60*10 3세트, 랫풀다운 50*12,50*10');
    expect(d).toHaveLength(1);
    expect(d[0]!.entries.map((e) => [e.exerciseId, e.sets.length])).toEqual([
      ['bench_press', 3],
      ['lat_pulldown', 2],
    ]);
  });

  it('모르는 종목은 exerciseId null 로 남김', () => {
    const d = parseRoutineText('외계인 운동 30*10 3세트');
    expect(d[0]!.entries[0]).toMatchObject({ rawName: '외계인 운동', exerciseId: null });
  });

  it('빈 글은 빈 배열', () => {
    expect(parseRoutineText('  ')).toEqual([]);
  });
});

describe('workingSets — 워밍업 제외', () => {
  it('최고 무게의 60% 미만은 워밍업', () => {
    expect(workingSets([{ weight: 20, reps: 20 }, { weight: 40, reps: 15 }, { weight: 60, reps: 10 }, { weight: 60, reps: 7 }]).length).toBe(3);
  });
});

describe('nextTarget — 다음 무게·반복 (더블 프로그레션)', () => {
  it('모든 본세트가 반복 상한 도달 → 증량', () => {
    const t = nextTarget('bench_press', [{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }]);
    expect(t).toMatchObject({ weight: 62.5, reps: 6, action: 'increase' });
  });
  it('범위 안 → 같은 무게로 반복 +1', () => {
    expect(nextTarget('bench_press', [{ weight: 50, reps: 8 }, { weight: 50, reps: 7 }])).toMatchObject({ weight: 50, reps: 8, action: 'reps' });
  });
  it('하한 미달 → 감량', () => {
    expect(nextTarget('pendulum_squat', [{ weight: 40, reps: 5 }])).toMatchObject({ weight: 35, action: 'decrease' });
  });
});

describe('auditRoutine — 논문 기준 점검·수정안', () => {
  const days = parseRoutineText(SAMPLE);
  const audit = auditRoutine(days);

  it('주간 부위별 세트 계산 (워밍업 제외)', () => {
    expect(audit.before.lats).toBeGreaterThan(25);
    expect(audit.before.chest).toBeGreaterThan(22);
  });

  it('MRV 초과 부위는 수정안에서 MRV 이하로', () => {
    expect(audit.after.lats).toBeLessThanOrEqual(25);
    expect(audit.after.chest).toBeLessThanOrEqual(22);
    // 둔근 때문에 스쿼트·데드리프트 같은 복합 운동은 줄이지 않음
    expect(audit.changes.filter((c) => c.kind === 'sets' && ['smith_squat', 'deadlift', 'rdl', 'bulgarian_split_squat'].includes(c.exerciseId))).toEqual([]);
    expect(audit.changes.some((c) => c.kind === 'sets' && c.to! < c.from!)).toBe(true);
  });

  it('같은 세션의 중복 가슴 프레스는 하나 빼기 제안', () => {
    expect(audit.changes).toContainEqual(expect.objectContaining({ kind: 'remove', day: '상체A', exerciseId: 'smith_bench' }));
  });

  it('라잉 레그컬만 있으면 하나를 시티드 레그컬로 (Maeo 2021)', () => {
    const swap = audit.changes.find((c) => c.kind === 'swap');
    expect(swap).toMatchObject({ exerciseId: 'lying_leg_curl', toExerciseId: 'seated_leg_curl' });
    expect(swap!.citations).toContain('maeo2021');
  });

  it('MEV 미만 부위는 세트·종목 추가 (종아리)', () => {
    expect(audit.before.calves).toBeLessThan(8);
    expect(audit.after.calves).toBeGreaterThanOrEqual(8);
  });

  it('모든 변경에 근거 논문이 붙음', () => {
    expect(audit.changes.length).toBeGreaterThan(0);
    expect(audit.changes.every((c) => c.citations.length > 0 && c.text.length > 0)).toBe(true);
  });

  it('종목별 다음 목표 제시', () => {
    expect(audit.targets.length).toBeGreaterThan(20);
    expect(audit.targets.find((t) => t.exerciseId === 'bench_press')).toMatchObject({ weight: 50, reps: 9 });
  });

  it('부족한 부위가 없으면 추가하지 않음', () => {
    const small = auditRoutine(parseRoutineText('벤치프레스 60*8 3세트'));
    expect(small.changes.filter((c) => c.kind === 'add' && c.exerciseId === 'bench_press')).toEqual([]);
  });
});

describe('routineToProgram', () => {
  it('수정안을 앱 루틴으로 변환 (세트 수·반복 범위·휴식)', () => {
    const days = parseRoutineText(SAMPLE);
    const audit = auditRoutine(days);
    const p = routineToProgram(audit.revised, 1000);
    expect(p.days.map((d) => d.name)).toEqual(['상체A', '하체A', '상체B', '하체B']);
    expect(p.splitId).toBe('upper_lower');
    expect(p.days[0]!.exercises.find((e) => e.exerciseId === 'bench_press')).toMatchObject({ repMin: 6, repMax: 10 });
    expect(programWeeklyVolume(p.days).lats).toBeCloseTo(audit.after.lats, 0);
  });
  it('원래 루틴 그대로도 변환 (워밍업 제외 세트 수)', () => {
    const p = routineToProgram(parseRoutineText(SAMPLE), 1000);
    expect(p.days[2]!.exercises.find((e) => e.exerciseId === 'barbell_row')!.sets).toBe(3);
  });
});

describe('목표 무게가 루틴에 들어감', () => {
  it('routineToProgram 은 다음 목표 무게·반복을 targetWeight/targetReps 로 담음', () => {
    const p = routineToProgram(parseRoutineText('상체A 루틴 (벤치프레스 50*8 5세트)'), 1000);
    expect(p.days[0]!.exercises[0]).toMatchObject({ targetWeight: 50, targetReps: 9 });
  });
  it('수정안에서 새로 넣은 종목은 무게 없음', () => {
    const a = auditRoutine(parseRoutineText('벤치프레스 60*8 3세트'));
    const p = routineToProgram(a.revised, 1000);
    const added = p.days[0]!.exercises.find((e) => e.exerciseId !== 'bench_press')!;
    expect(added.targetWeight).toBeUndefined();
  });
});

describe('같은 부위 날(하체A·하체B) 사이 고르게 배분', () => {
  const text = '하체A 루틴 (레그익스텐션 50*12 4세트, 핵스쿼트 100*10 4세트, 시티드레그컬 40*12 3세트) 하체B 루틴 (데드리프트 100*6 3세트, 시티드레그컬 40*12 3세트)';
  const direct = (days: ReturnType<typeof parseRoutineText>, name: string, ids: string[]) =>
    days.find((d) => d.name === name)!.entries.filter((e) => ids.includes(e.exerciseId!)).reduce((s, e) => s + workingSets(e.sets).length, 0);

  it('한쪽에 몰린 대퇴사두 고립 종목을 다른 날로 옮김', () => {
    const a = auditRoutine(parseRoutineText(text));
    expect(a.changes).toContainEqual(expect.objectContaining({ kind: 'move', day: '하체A', toDay: '하체B', exerciseId: 'leg_extension' }));
    const q = ['leg_extension', 'hack_squat'];
    expect(Math.abs(direct(a.revised, '하체A', q) - direct(a.revised, '하체B', q))).toBeLessThan(8);
  });
  it('옮기기에도 근거(빈도 연구)가 붙음', () => {
    const a = auditRoutine(parseRoutineText(text));
    expect(a.changes.find((c) => c.kind === 'move')!.citations).toContain('schoenfeld2016freq');
  });
  it('상체 ↔ 하체 사이에는 옮기지 않음', () => {
    const a = auditRoutine(parseRoutineText('상체A 루틴 (벤치프레스 60*8 4세트) 하체A 루틴 (레그익스텐션 50*12 4세트, 핵스쿼트 100*10 4세트)'));
    expect(a.changes.filter((c) => c.kind === 'move')).toEqual([]);
  });
  it('사용자 루틴: 하체A 에 몰린 대퇴사두를 하체B 로 나눔', () => {
    const a = auditRoutine(parseRoutineText(SAMPLE));
    expect(a.changes.some((c) => c.kind === 'move' && c.day.startsWith('하체') && c.toDay!.startsWith('하체'))).toBe(true);
  });
});

describe('어시스트 머신은 보조 무게라 방향이 반대', () => {
  it('하한 미달 → 보조 무게를 올림', () => {
    expect(nextTarget('assisted_dip', [{ weight: 30, reps: 7 }])).toMatchObject({ weight: 35, action: 'decrease' });
  });
  it('상한 도달 → 보조 무게를 내림', () => {
    expect(nextTarget('assisted_pull_up', [{ weight: 20, reps: 12 }])).toMatchObject({ weight: 15, action: 'increase' });
  });
});

describe('운동 시간 제한 (예: 70분)', () => {
  const days = parseRoutineText(SAMPLE);
  const base = auditRoutine(days);
  const fit = auditRoutine(days, { maxMinutes: 70 });

  it('루틴별 예상 시간(전·후)을 알려줌', () => {
    expect(base.durations.map((d) => d.name)).toEqual(['상체A', '하체A', '상체B', '하체B']);
    expect(base.durations.some((d) => d.after > 70)).toBe(true);
  });
  it('70분 제한이면 모든 루틴이 70분 이하', () => {
    expect(fit.durations.every((d) => d.after <= 70)).toBe(true);
  });
  it('줄여도 부위별 최소 유효량(MEV)은 지킴', async () => {
    const { VOLUME_LANDMARKS } = await import('../domain/research');
    for (const [m, v] of Object.entries(fit.after)) {
      const l = VOLUME_LANDMARKS[m as keyof typeof VOLUME_LANDMARKS];
      if (base.after[m as keyof typeof base.after] >= l.mev) expect(v).toBeGreaterThanOrEqual(l.mev);
    }
  });
  it('시간 때문에 바꾼 항목은 이유에 "70분" 과 근거가 있음', () => {
    const t = fit.changes.filter((c) => c.text.includes('70분'));
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((c) => c.citations.length > 0)).toBe(true);
  });
  it('제한이 없으면 시간 때문에 줄이지 않음', () => {
    expect(base.changes.some((c) => c.text.includes('분 맞추기'))).toBe(false);
  });
  it('도저히 안 되는 시간이면 MEV 는 지키고 알려줌', () => {
    const a = auditRoutine(days, { maxMinutes: 15 });
    expect(a.notes.some((n) => n.text.includes('15분 안에'))).toBe(true);
  });
});

describe('근비대 반복 범위 점검', () => {
  it('본세트가 20회를 넘는 종목은 무게를 올려 범위 안으로 (사용자 루틴: 사이드 레터럴 25회, 카프 30회)', () => {
    const a = auditRoutine(parseRoutineText(SAMPLE));
    const reps = a.notes.filter((n) => n.citations.includes('schoenfeld2021continuum'));
    expect(reps.some((n) => n.text.includes('사이드 레터럴'))).toBe(true);
    expect(reps.some((n) => n.text.includes('카프'))).toBe(true);
  });
  it('5회 미만 세트도 알려줌', () => {
    const a = auditRoutine(parseRoutineText('스쿼트 140*3 4세트'));
    expect(a.notes.some((n) => n.text.includes('3회'))).toBe(true);
  });
});
