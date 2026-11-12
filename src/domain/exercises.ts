import type { Exercise } from './types';

// 기여도: 1 = 직접 세트, 0.5 = 간접 세트 (Pelland 2024 fractional set counting 방식)
export const EXERCISES: Exercise[] = [
  // ── 가슴
  { id: 'bench_press', name: '바벨 벤치프레스', equipment: 'barbell', compound: true, increment: 2.5, muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 } },
  { id: 'incline_bench', name: '인클라인 바벨 벤치프레스', equipment: 'barbell', compound: true, increment: 2.5, muscles: { chest: 1, front_delts: 0.5, triceps: 0.5 } },
  { id: 'db_bench', name: '덤벨 벤치프레스', equipment: 'dumbbell', compound: true, increment: 2, muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 } },
  { id: 'incline_db_press', name: '인클라인 덤벨 프레스', equipment: 'dumbbell', compound: true, increment: 2, muscles: { chest: 1, front_delts: 0.5, triceps: 0.5 } },
  { id: 'machine_chest_press', name: '머신 체스트 프레스', equipment: 'machine', compound: true, increment: 5, muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 } },
  { id: 'dips', name: '딥스', equipment: 'bodyweight', compound: true, increment: 2.5, muscles: { chest: 1, triceps: 1, front_delts: 0.5 } },
  { id: 'cable_fly', name: '케이블 플라이', equipment: 'cable', compound: false, increment: 2.5, muscles: { chest: 1 } },
  { id: 'pec_deck', name: '펙덱 플라이', equipment: 'machine', compound: false, increment: 5, muscles: { chest: 1 } },
  { id: 'smith_bench', name: '스미스 벤치프레스', equipment: 'smith', compound: true, increment: 2.5, muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 } },
  { id: 'smith_incline_bench', name: '스미스 인클라인 벤치프레스', equipment: 'smith', compound: true, increment: 2.5, muscles: { chest: 1, front_delts: 0.5, triceps: 0.5 } },
  { id: 'db_fly', name: '덤벨 플라이', equipment: 'dumbbell', compound: false, increment: 1, muscles: { chest: 1 } },
  { id: 'push_up', name: '푸시업', equipment: 'bodyweight', compound: true, increment: 0, muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 } },

  // ── 등
  { id: 'pull_up', name: '풀업', equipment: 'bodyweight', compound: true, increment: 2.5, muscles: { lats: 1, upper_back: 0.5, biceps: 0.5 } },
  { id: 'lat_pulldown', name: '랫 풀다운', equipment: 'cable', compound: true, increment: 5, muscles: { lats: 1, upper_back: 0.5, biceps: 0.5 } },
  { id: 'barbell_row', name: '바벨 로우', equipment: 'barbell', compound: true, increment: 2.5, muscles: { upper_back: 1, lats: 1, rear_delts: 0.5, biceps: 0.5, lower_back: 0.5 } },
  { id: 'db_row', name: '원암 덤벨 로우', equipment: 'dumbbell', compound: true, increment: 2, muscles: { lats: 1, upper_back: 1, biceps: 0.5, rear_delts: 0.5 } },
  { id: 'seated_cable_row', name: '시티드 케이블 로우', equipment: 'cable', compound: true, increment: 5, muscles: { upper_back: 1, lats: 1, biceps: 0.5, rear_delts: 0.5 } },
  { id: 'chest_supported_row', name: '체스트 서포티드 로우', equipment: 'machine', compound: true, increment: 5, muscles: { upper_back: 1, lats: 0.5, rear_delts: 0.5, biceps: 0.5 } },
  { id: 't_bar_row', name: 'T바 로우', equipment: 'machine', compound: true, increment: 5, muscles: { upper_back: 1, lats: 1, rear_delts: 0.5, biceps: 0.5 } },
  { id: 'straight_arm_pulldown', name: '스트레이트 암 풀다운', equipment: 'cable', compound: false, increment: 2.5, muscles: { lats: 1 } },
  { id: 'shrug', name: '슈러그', equipment: 'dumbbell', compound: false, increment: 2, muscles: { upper_back: 1, forearms: 0.5 } },

  // ── 어깨
  { id: 'ohp', name: '오버헤드 프레스', equipment: 'barbell', compound: true, increment: 2.5, muscles: { front_delts: 1, side_delts: 0.5, triceps: 0.5 } },
  { id: 'db_shoulder_press', name: '덤벨 숄더 프레스', equipment: 'dumbbell', compound: true, increment: 2, muscles: { front_delts: 1, side_delts: 0.5, triceps: 0.5 } },
  { id: 'smith_ohp', name: '스미스 숄더 프레스', equipment: 'smith', compound: true, increment: 2.5, muscles: { front_delts: 1, side_delts: 0.5, triceps: 0.5 } },
  { id: 'machine_shoulder_press', name: '머신 숄더 프레스', equipment: 'machine', compound: true, increment: 5, muscles: { front_delts: 1, side_delts: 0.5, triceps: 0.5 } },
  { id: 'lateral_raise', name: '사이드 레터럴 레이즈', equipment: 'dumbbell', compound: false, increment: 1, muscles: { side_delts: 1 } },
  { id: 'cable_lateral_raise', name: '케이블 레터럴 레이즈', equipment: 'cable', compound: false, increment: 1.25, muscles: { side_delts: 1 } },
  { id: 'rear_delt_fly', name: '리어 델트 플라이', equipment: 'machine', compound: false, increment: 2.5, muscles: { rear_delts: 1, upper_back: 0.5 } },
  { id: 'face_pull', name: '페이스 풀', equipment: 'cable', compound: false, increment: 2.5, muscles: { rear_delts: 1, upper_back: 0.5 } },

  // ── 팔
  { id: 'barbell_curl', name: '바벨 컬', equipment: 'barbell', compound: false, increment: 2.5, muscles: { biceps: 1, forearms: 0.5 } },
  { id: 'db_curl', name: '덤벨 컬', equipment: 'dumbbell', compound: false, increment: 1, muscles: { biceps: 1, forearms: 0.5 } },
  { id: 'incline_db_curl', name: '인클라인 덤벨 컬', equipment: 'dumbbell', compound: false, increment: 1, muscles: { biceps: 1 } },
  { id: 'hammer_curl', name: '해머 컬', equipment: 'dumbbell', compound: false, increment: 1, muscles: { biceps: 1, forearms: 1 } },
  { id: 'cable_curl', name: '케이블 컬', equipment: 'cable', compound: false, increment: 2.5, muscles: { biceps: 1 } },
  { id: 'preacher_curl', name: '프리처 컬', equipment: 'machine', compound: false, increment: 2.5, muscles: { biceps: 1 } },
  { id: 'triceps_pushdown', name: '트라이셉스 푸시다운', equipment: 'cable', compound: false, increment: 2.5, muscles: { triceps: 1 } },
  { id: 'overhead_triceps_ext', name: '오버헤드 트라이셉스 익스텐션', equipment: 'cable', compound: false, increment: 2.5, muscles: { triceps: 1 } },
  { id: 'skull_crusher', name: '라잉 트라이셉스 익스텐션', equipment: 'barbell', compound: false, increment: 2.5, muscles: { triceps: 1 } },
  { id: 'close_grip_bench', name: '클로즈그립 벤치프레스', equipment: 'barbell', compound: true, increment: 2.5, muscles: { triceps: 1, chest: 0.5, front_delts: 0.5 } },
  { id: 'wrist_curl', name: '리스트 컬', equipment: 'dumbbell', compound: false, increment: 1, muscles: { forearms: 1 } },

  // ── 하체
  { id: 'squat', name: '바벨 백스쿼트', equipment: 'barbell', compound: true, increment: 2.5, muscles: { quads: 1, glutes: 1, lower_back: 0.5 } },
  { id: 'front_squat', name: '프론트 스쿼트', equipment: 'barbell', compound: true, increment: 2.5, muscles: { quads: 1, glutes: 0.5, upper_back: 0.5 } },
  { id: 'smith_squat', name: '스미스 스쿼트', equipment: 'smith', compound: true, increment: 2.5, muscles: { quads: 1, glutes: 1 } },
  { id: 'hack_squat', name: '핵 스쿼트', equipment: 'machine', compound: true, increment: 5, muscles: { quads: 1, glutes: 0.5 } },
  { id: 'leg_press', name: '레그 프레스', equipment: 'machine', compound: true, increment: 10, muscles: { quads: 1, glutes: 0.5 } },
  { id: 'bulgarian_split_squat', name: '불가리안 스플릿 스쿼트', equipment: 'dumbbell', compound: true, increment: 2, muscles: { quads: 1, glutes: 1 } },
  { id: 'leg_extension', name: '레그 익스텐션', equipment: 'machine', compound: false, increment: 5, muscles: { quads: 1 } },
  { id: 'deadlift', name: '컨벤셔널 데드리프트', equipment: 'barbell', compound: true, increment: 5, muscles: { glutes: 1, hamstrings: 1, lower_back: 1, upper_back: 0.5, quads: 0.5, forearms: 0.5 } },
  { id: 'rdl', name: '루마니안 데드리프트', equipment: 'barbell', compound: true, increment: 2.5, muscles: { hamstrings: 1, glutes: 1, lower_back: 0.5 } },
  { id: 'lying_leg_curl', name: '라잉 레그 컬', equipment: 'machine', compound: false, increment: 2.5, muscles: { hamstrings: 1 } },
  { id: 'seated_leg_curl', name: '시티드 레그 컬', equipment: 'machine', compound: false, increment: 2.5, muscles: { hamstrings: 1 } },
  { id: 'hip_thrust', name: '힙 쓰러스트', equipment: 'barbell', compound: true, increment: 5, muscles: { glutes: 1, hamstrings: 0.5 } },
  { id: 'standing_calf_raise', name: '스탠딩 카프 레이즈', equipment: 'machine', compound: false, increment: 5, muscles: { calves: 1 } },
  { id: 'seated_calf_raise', name: '시티드 카프 레이즈', equipment: 'machine', compound: false, increment: 5, muscles: { calves: 1 } },

  // ── 코어
  { id: 'cable_crunch', name: '케이블 크런치', equipment: 'cable', compound: false, increment: 2.5, muscles: { abs: 1 } },
  { id: 'hanging_leg_raise', name: '행잉 레그 레이즈', equipment: 'bodyweight', compound: false, increment: 0, muscles: { abs: 1 } },
  { id: 'back_extension', name: '백 익스텐션', equipment: 'bodyweight', compound: false, increment: 2.5, muscles: { lower_back: 1, glutes: 0.5, hamstrings: 0.5 } },
];

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

let customExercises: Exercise[] = [];

/** 사용자 정의 운동을 런타임 카탈로그에 등록 (DB 로드 시 호출) */
export function registerCustomExercises(list: Exercise[]): void {
  for (const e of customExercises) byId.delete(e.id);
  customExercises = list;
  for (const e of list) byId.set(e.id, { ...e, custom: true });
}

export function getExercise(id: string): Exercise | undefined {
  return byId.get(id);
}

export function allExercises(): Exercise[] {
  return [...byId.values()];
}
