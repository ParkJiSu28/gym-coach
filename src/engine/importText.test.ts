import { describe, expect, it } from 'vitest';
import { matchExercise, parseWorkoutText } from './importText';

// 사용자가 다른 앱 캡처를 아이폰 "텍스트 인식"으로 복사해 붙여넣은 원문 (광고·상태바 포함)
const SAMPLE = `5:554
•ll 5G
100)
저장
AD DramaBox | INSTALL
하체b(햄/둔)
:
+ 웜업 스트레칭
PRO
힙 쓰러스트 머신
:
메모...
-
세트
+
불러오기
1
40 kg
10회
2
40 kg
10회
3
40 kg
10회
데드리프트
仁
+ 종목 추가
메모...
아침 저녁
여유
언제 어디서든 즐거움이 가득
BIGO LIVE`;

const NOW = new Date(2026, 10, 12, 18).getTime(); // 2026-11-12

describe('parseWorkoutText — 캡처 텍스트에서 기록 추출', () => {
  it('실제 붙여넣기 원문: 루틴 제목, 종목, 세트를 찾고 광고·버튼 글자는 무시', () => {
    const r = parseWorkoutText(SAMPLE, NOW);
    expect(r.title).toBe('하체b(햄/둔)');
    expect(r.exercises.map((e) => e.name)).toEqual(['힙 쓰러스트 머신', '데드리프트']);
    expect(r.exercises[0]).toMatchObject({
      exerciseId: 'machine_hip_thrust',
      sets: [
        { weight: 40, reps: 10 },
        { weight: 40, reps: 10 },
        { weight: 40, reps: 10 },
      ],
    });
    // 캡처에서 잘린 종목은 세트 없음으로 남김
    expect(r.exercises[1]).toMatchObject({ exerciseId: 'deadlift', sets: [] });
    expect(r.skipped).toEqual([]);
  });

  it('상태바 시각·배터리 숫자를 세트로 오인하지 않음', () => {
    const r = parseWorkoutText('5:55\n100)\n벤치프레스\n60 kg\n8회', NOW);
    expect(r.exercises).toHaveLength(1);
    expect(r.exercises[0]!.sets).toEqual([{ weight: 60, reps: 8 }]);
  });

  it('한 줄 형식: "80kg x 8", "80 × 8", "1 40 kg 10회"', () => {
    const r = parseWorkoutText('바벨 벤치프레스\n80kg x 8\n80 × 7\n1 75 kg 8회', NOW);
    expect(r.exercises[0]!.sets).toEqual([
      { weight: 80, reps: 8 },
      { weight: 80, reps: 7 },
      { weight: 75, reps: 8 },
    ]);
  });

  it('종목 이름과 세트가 같은 줄: "스쿼트 100kg 5회"', () => {
    const r = parseWorkoutText('스쿼트 100kg 5회\n스쿼트 100kg 5회', NOW);
    expect(r.exercises[0]).toMatchObject({ exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] });
    expect(r.exercises).toHaveLength(1);
  });

  it('무게 단위 lb 는 kg 로 환산 (0.5 단위)', () => {
    const r = parseWorkoutText('Bench Press\n135 lb\n10 reps', NOW);
    expect(r.exercises[0]).toMatchObject({ exerciseId: 'bench_press', sets: [{ weight: 61, reps: 10 }] });
  });

  it('무게가 빠진 세트는 같은 종목의 직전 무게, 없으면 0 (맨몸)', () => {
    const r = parseWorkoutText('풀업\n12회\n10회\n덤벨 컬\n12 kg\n10회\n8회', NOW);
    expect(r.exercises[0]!.sets).toEqual([{ weight: 0, reps: 12 }, { weight: 0, reps: 10 }]);
    expect(r.exercises[1]!.sets).toEqual([{ weight: 12, reps: 10 }, { weight: 12, reps: 8 }]);
  });

  it('비정상 반복·무게는 버리고 skipped 에 기록', () => {
    const r = parseWorkoutText('레그 프레스\n200 kg\n0회\n2000 kg\n10회\n180 kg\n12회', NOW);
    expect(r.exercises[0]!.sets).toEqual([{ weight: 180, reps: 12 }]);
    expect(r.skipped).toHaveLength(2);
  });

  it('날짜 줄 인식: "2026.11.10", "11월 3일", 미래면 작년', () => {
    expect(new Date(parseWorkoutText('2026.11.10\n스쿼트\n100kg\n5회', NOW).date!).getDate()).toBe(10);
    const d = new Date(parseWorkoutText('11월 3일 (월)\n스쿼트\n100kg\n5회', NOW).date!);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 11, 3]);
    expect(new Date(parseWorkoutText('12월 25일\n스쿼트\n100kg\n5회', NOW).date!).getFullYear()).toBe(2025);
    expect(parseWorkoutText(SAMPLE, NOW).date).toBeUndefined();
  });

  it('빈 입력', () => {
    expect(parseWorkoutText('   \n  ', NOW)).toEqual({ exercises: [], skipped: [] });
  });

  it('종목 이름 없이 세트만 있으면 이름 없는 항목(직접 선택 필요)', () => {
    const r = parseWorkoutText('40 kg\n10회', NOW);
    expect(r.exercises[0]).toMatchObject({ name: '', exerciseId: null, sets: [{ weight: 40, reps: 10 }] });
  });
});

describe('matchExercise — 종목 이름 맞추기', () => {
  it.each([
    ['벤치프레스', 'bench_press'],
    ['벤치', 'bench_press'],
    ['Bench Press', 'bench_press'],
    ['바벨 벤치 프레스', 'bench_press'],
    ['스미스 벤치프레스', 'smith_bench'],
    ['인클라인 덤벨 프레스', 'incline_db_press'],
    ['랫풀다운', 'lat_pulldown'],
    ['렛 풀 다운', 'lat_pulldown'],
    ['사레레', 'lateral_raise'],
    ['힙 쓰러스트 머신', 'machine_hip_thrust'],
    ['힙쓰러스트', 'hip_thrust'],
    ['데드리프트', 'deadlift'],
    ['루마니안 데드리프트', 'rdl'],
    ['레그컬', 'seated_leg_curl'],
    ['바벨 백스쿼트', 'squat'],
    ['레그 프레스', 'leg_press'],
  ])('%s → %s', (name, id) => {
    expect(matchExercise(name)).toBe(id);
  });

  it('모르는 종목은 null', () => {
    expect(matchExercise('파워 클린')).toBeNull();
    expect(matchExercise('')).toBeNull();
  });
});
