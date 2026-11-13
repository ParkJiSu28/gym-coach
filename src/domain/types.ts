// 도메인 타입 정의. 모든 시간은 epoch ms, 무게는 kg.

export const MUSCLES = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'lats',
  'upper_back',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'lower_back',
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: '가슴',
  front_delts: '전면 삼각근',
  side_delts: '측면 삼각근',
  rear_delts: '후면 삼각근',
  lats: '광배근',
  upper_back: '등 상부(승모·능형)',
  biceps: '이두',
  triceps: '삼두',
  forearms: '전완',
  quads: '대퇴사두',
  hamstrings: '햄스트링',
  glutes: '둔근',
  calves: '종아리',
  abs: '복근',
  lower_back: '척추기립근',
};

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'smith';

/** 근육별 자극 기여도: 1 = 주동근(직접 세트), 0.5 = 협력근(간접 세트). */
export type MuscleContribution = Partial<Record<Muscle, number>>;

export interface Exercise {
  id: string;
  name: string;
  equipment: Equipment;
  /** 다관절(복합) 운동 여부 → 권장 휴식 시간, 증량 단위에 영향 */
  compound: boolean;
  muscles: MuscleContribution;
  /** 기본 증량 단위(kg) */
  increment: number;
  custom?: boolean;
}

export interface WorkoutSession {
  id?: number;
  startedAt: number;
  endedAt?: number;
  programId?: number;
  dayId?: string;
  note?: string;
  /** 다른 앱 기록을 손으로 옮겨 적은 세션 (실제 운동 시간·휴식 정보 없음) */
  manual?: boolean;
  /** 이번 세션에서 바꾼 종목: 계획 종목 id → 실제 수행 종목 id */
  swaps?: Record<string, string>;
}

export interface SetLog {
  id?: number;
  sessionId: number;
  exerciseId: string;
  order: number;
  weight: number;
  reps: number;
  /** Reps In Reserve: 실패까지 남은 반복 수 (0 = 실패) */
  rir: number;
  /** 직전 세트 완료 → 이 세트 완료까지 간격(초). 첫 세트는 undefined */
  restSec?: number;
  completedAt: number;
  warmup?: boolean;
  /** RIR 을 직접 재지 않아 기본값으로 채운 경우 true */
  rirEstimated?: boolean;
}

/** 주관적 컨디션 체크인 (1 = 최악, 5 = 최상). soreness 는 5 = 근육통 없음, stress 는 5 = 스트레스 없음. */
export interface Checkin {
  id?: number;
  date: number;
  sleep: number;
  soreness: number;
  motivation: number;
  stress: number;
}

export interface ProgramExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  /** 가져온 루틴에서 계산한 다음 목표 (기록이 없을 때 첫 처방에 사용) */
  targetWeight?: number;
  targetReps?: number;
}

export interface ProgramDay {
  id: string;
  name: string;
  exercises: ProgramExercise[];
}

export type SplitId = 'full_body' | 'upper_lower' | 'ppl' | 'upper_lower_ppl' | 'bro';

export interface Program {
  id?: number;
  name: string;
  splitId: SplitId;
  createdAt: number;
  active: boolean;
  days: ProgramDay[];
  /** 메소사이클 시작 시점과 길이(주, 디로딩 주 제외) */
  mesoStart: number;
  mesoWeeks: number;
  priorities: Muscle[];
  /** 운동 가능 요일 (0=일 … 6=토, 월요일부터 정렬). 없으면 순환 방식 */
  weekdays?: number[];
}

export type EvidenceLevel = 'meta-analysis' | 'rct' | 'consensus' | 'expert-opinion' | 'model';
