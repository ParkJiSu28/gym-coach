import { VOLUME_LANDMARKS } from '../domain/research';
import type { Exercise, Muscle, Program, SetLog } from '../domain/types';
import { estimate1RM, roundToIncrement, weightForTarget } from './e1rm';
import { WEEK_MS } from './volume';

/** 추천 근거: 사람이 읽을 문장 + research.ts 의 인용 id */
export interface Reason {
  text: string;
  citations: string[];
}

export interface ExerciseSession {
  sessionId: number;
  date: number;
  sets: SetLog[];
}

/** 종목별 세션 이력 (워밍업 제외, 날짜 오름차순) */
export function exerciseHistory(sets: SetLog[], exerciseId: string): ExerciseSession[] {
  const bySession = new Map<number, SetLog[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.warmup) continue;
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
    bySession.get(s.sessionId)!.push(s);
  }
  return [...bySession.entries()]
    .map(([sessionId, list]) => {
      const sorted = [...list].sort((a, b) => a.order - b.order);
      return { sessionId, date: Math.min(...sorted.map((s) => s.completedAt)), sets: sorted };
    })
    .sort((a, b) => a.date - b.date);
}

export function sessionBestE1RM(session: ExerciseSession): number {
  return Math.max(0, ...session.sets.map((s) => estimate1RM(s.weight, s.reps, s.rir)));
}

// ─────────────────────────────── 메소사이클

export interface MesoPosition {
  /** 1부터 시작하는 메소사이클 내 주차 (디로딩 주 = mesoWeeks + 1) */
  week: number;
  totalWeeks: number;
  isDeload: boolean;
  cycle: number;
}

export function mesoPosition(program: Pick<Program, 'mesoStart' | 'mesoWeeks'>, now: number): MesoPosition {
  const cycleLen = program.mesoWeeks + 1;
  const elapsed = Math.max(0, Math.floor((now - program.mesoStart) / WEEK_MS));
  const pos = elapsed % cycleLen;
  return {
    week: pos + 1,
    totalWeeks: program.mesoWeeks,
    isDeload: pos === program.mesoWeeks,
    cycle: Math.floor(elapsed / cycleLen) + 1,
  };
}

/**
 * 메소사이클 주차별 목표 RIR: 3 → 1(복합) / 0(고립) 으로 점진적으로 실패에 가깝게.
 * Refalo 2023 (0~3 RIR 유효), Helms 2016 (RIR 자동조절). 디로딩 주는 RIR 4+.
 */
export function targetRir(meso: MesoPosition, compound: boolean): number {
  if (meso.isDeload) return 4;
  const end = compound ? 1 : 0;
  if (meso.totalWeeks <= 1) return end;
  const t = (meso.week - 1) / (meso.totalWeeks - 1);
  return Math.round(3 - (3 - end) * t);
}

// ─────────────────────────────── 다음 세트 처방

export type ProgressionAction = 'start' | 'increase_load' | 'add_reps' | 'hold' | 'decrease_load' | 'deload';

export const ACTION_LABEL: Record<ProgressionAction, string> = {
  start: '기준점 측정',
  increase_load: '증량',
  add_reps: '반복 수 +1',
  hold: '유지',
  decrease_load: '감량',
  deload: '디로딩',
};

export interface SuggestInput {
  exercise: Exercise;
  history: ExerciseSession[];
  repMin: number;
  repMax: number;
  targetRir: number;
  plannedSets: number;
  deload?: boolean;
}

export interface Suggestion {
  action: ProgressionAction;
  weight: number | null;
  repsTarget: number;
  rir: number;
  sets: number;
  restSec: number;
  performanceDrop: boolean;
  reasons: Reason[];
}

export function recommendedRest(exercise: Exercise): number {
  // Schoenfeld 2016: 3분 > 1분. Singer 2024: 60초 초과면 유리, 90초 이후 차이 작음.
  return exercise.compound ? 150 : 90;
}

export function suggestNext(input: SuggestInput): Suggestion {
  const { exercise, history, repMin, repMax, plannedSets } = input;
  const rir = input.deload ? 4 : input.targetRir;
  const restSec = recommendedRest(exercise);
  const reasons: Reason[] = [];
  const last = history.at(-1);

  if (!last || last.sets.length === 0) {
    return {
      action: 'start',
      weight: null,
      repsTarget: repMax,
      rir: 3,
      sets: plannedSets,
      restSec,
      performanceDrop: false,
      reasons: [
        {
          text: `첫 기록입니다. ${repMax}회를 했을 때 2~3회 더 할 수 있을 정도(RIR 3)의 무게를 찾아 기준점을 만드세요.`,
          citations: ['helms2016'],
        },
      ],
    };
  }

  const inc = exercise.increment;
  const topWeight = Math.max(...last.sets.map((s) => s.weight));
  const topSets = last.sets.filter((s) => s.weight === topWeight);
  const minRepsTop = Math.min(...topSets.map((s) => s.reps));
  const avgRir = topSets.reduce((a, s) => a + s.rir, 0) / topSets.length;
  const e1 = sessionBestE1RM(last);
  const prev = history.at(-2);
  const performanceDrop = prev ? e1 < sessionBestE1RM(prev) * 0.95 : false;

  if (performanceDrop) {
    reasons.push({
      text: '직전 세션 대비 추정 1RM 이 5% 이상 하락했습니다. 피로 누적 신호일 수 있습니다.',
      citations: ['bell2023'],
    });
  }

  const restLogs = last.sets.map((s) => s.restSec).filter((r): r is number => r !== undefined);
  const avgRest = restLogs.length ? restLogs.reduce((a, b) => a + b, 0) / restLogs.length : null;
  if (avgRest !== null && avgRest < 75) {
    reasons.push({
      text: `지난 세션 평균 휴식 ${Math.round(avgRest)}초 — 너무 짧습니다. ${restSec}초 이상 쉬면 세트당 수행량이 늘어 근비대에 유리합니다.`,
      citations: ['schoenfeld2016rest', 'singer2024'],
    });
  }

  if (input.deload) {
    return {
      action: 'deload',
      weight: roundToIncrement(topWeight * 0.9, inc, 'down'),
      repsTarget: repMin,
      rir,
      sets: Math.max(1, Math.ceil(plannedSets / 2)),
      restSec,
      performanceDrop,
      reasons: [
        ...reasons,
        { text: '디로딩 주: 세트 수 절반, 무게 약 10% 감소, 실패에서 4회 이상 여유(RIR 4+).', citations: ['bell2023'] },
      ],
    };
  }

  const allTop = topSets.every((s) => s.reps >= repMax);

  if (allTop && inc > 0) {
    const fromE1 = roundToIncrement(weightForTarget(e1, repMin, rir), inc, 'down');
    const cap = roundToIncrement(topWeight * 1.1, inc, 'down');
    const weight = Math.max(topWeight + inc, Math.min(fromE1, cap));
    return {
      action: 'increase_load',
      weight,
      repsTarget: repMin,
      rir,
      sets: plannedSets,
      restSec,
      performanceDrop,
      reasons: [
        ...reasons,
        {
          text: `지난 세션 ${topWeight}kg 로 모든 세트 ${repMax}회(상한) 달성 → ${weight}kg 로 올리고 ${repMin}회부터 다시 쌓습니다 (더블 프로그레션).`,
          citations: ['schoenfeld2017load', 'helms2016'],
        },
      ],
    };
  }

  if (minRepsTop < repMin) {
    const fromE1 = roundToIncrement(weightForTarget(e1, repMin, rir), inc, 'down');
    const weight = inc > 0 ? Math.max(inc, Math.min(topWeight - inc, fromE1)) : topWeight;
    return {
      action: inc > 0 ? 'decrease_load' : 'hold',
      weight,
      repsTarget: repMin,
      rir,
      sets: plannedSets,
      restSec,
      performanceDrop,
      reasons: [
        ...reasons,
        {
          text: `${topWeight}kg 에서 ${minRepsTop}회 — 목표 범위(${repMin}~${repMax}회) 미달. 추정 1RM ${e1.toFixed(1)}kg 기준 ${weight}kg 로 조정합니다.`,
          citations: ['epley1985', 'schoenfeld2017load'],
        },
      ],
    };
  }

  if (avgRir < rir - 1) {
    return {
      action: 'hold',
      weight: topWeight,
      repsTarget: minRepsTop,
      rir,
      sets: plannedSets,
      restSec,
      performanceDrop,
      reasons: [
        ...reasons,
        {
          text: `지난 세션 평균 RIR ${avgRir.toFixed(1)} — 이번 주 목표(RIR ${rir})보다 실패에 가깝게 했습니다. 같은 무게·반복으로 여유를 확보한 뒤 진행하세요.`,
          citations: ['refalo2023', 'helms2016'],
        },
      ],
    };
  }

  const repsTarget = Math.min(repMax, minRepsTop + 1);
  return {
    action: 'add_reps',
    weight: topWeight,
    repsTarget,
    rir,
    sets: plannedSets,
    restSec,
    performanceDrop,
    reasons: [
      ...reasons,
      {
        text: `${topWeight}kg 유지, 세트당 ${repsTarget}회 목표 (지난 최저 ${minRepsTop}회 +1). 상한 ${repMax}회를 모든 세트에서 채우면 증량합니다.`,
        citations: ['helms2016'],
      },
    ],
  };
}

// ─────────────────────────────── 세트 수 조정

export interface SetAdjustInput {
  exercise: Exercise;
  plannedSets: number;
  weekly: Record<Muscle, number>;
  recovery: Record<Muscle, number>;
  readiness: number | null;
  deload: boolean;
  /** 이 종목의 이전 기록 존재 여부 — 첫 세션에는 계획 세트를 그대로 사용 */
  hasHistory?: boolean;
  /** 메소사이클 주차(1부터). 프로그램이 없으면 null */
  mesoWeek?: number | null;
}

export function adjustSets(input: SetAdjustInput): { sets: number; reasons: Reason[] } {
  const { exercise, plannedSets, weekly, recovery, readiness, deload, hasHistory = false, mesoWeek = null } = input;
  if (deload) {
    return { sets: Math.max(1, Math.ceil(plannedSets / 2)), reasons: [] };
  }
  const primaries = (Object.entries(exercise.muscles) as [Muscle, number][])
    .filter(([, c]) => c >= 1)
    .map(([m]) => m);
  const reasons: Reason[] = [];
  let sets = plannedSets;

  const minRec = primaries.length ? Math.min(...primaries.map((m) => recovery[m])) : 100;
  if (minRec < 50) {
    sets -= 1;
    reasons.push({
      text: `주동근 회복도 ${minRec}% — 아직 회복이 덜 돼 1세트 줄입니다.`,
      citations: ['app_fatigue_model'],
    });
  }
  if (readiness !== null && readiness < 40) {
    sets -= 1;
    reasons.push({ text: `오늘 컨디션 점수 ${readiness}/100 — 1세트 줄입니다.`, citations: ['helms2016'] });
  }
  const overMrv = primaries.find((m) => weekly[m] > VOLUME_LANDMARKS[m].mrv);
  if (overMrv) {
    sets -= 1;
    reasons.push({
      text: `이번 주 볼륨이 이미 회복 한계(MRV ${VOLUME_LANDMARKS[overMrv].mrv}세트)를 넘었습니다.`,
      citations: ['israetel_landmarks', 'bazvalle2022'],
    });
  }
  // 볼륨 점진 증가: 기록이 있고 회복이 좋을 때만.
  // 메소사이클 2주차부터는 최적 범위 하한까지, 프로그램이 없으면 MEV 까지 끌어올린다.
  // 프로그램 1주차는 설계된 계획 볼륨을 그대로 쓴다 (주 초반엔 7일 롤링 볼륨이 낮게 보이므로).
  const ramping = mesoWeek !== null && mesoWeek >= 2;
  const canAdd = mesoWeek === null || ramping;
  const floorOf = (m: Muscle) => (ramping ? VOLUME_LANDMARKS[m].mavLow : VOLUME_LANDMARKS[m].mev);
  const under = primaries.find((m) => weekly[m] < floorOf(m));
  if (reasons.length === 0 && canAdd && hasHistory && under && minRec >= 80 && (readiness === null || readiness >= 60)) {
    sets += 1;
    reasons.push({
      text: ramping
        ? `메소사이클 ${mesoWeek}주차 · 회복 양호 · 최근 7일 ${weekly[under]}세트(최적 하한 ${floorOf(under)} 미만) → 1세트 추가 (점진적 볼륨 증가).`
        : `최근 7일 볼륨 ${weekly[under]}세트 — 최소 효과 볼륨(${floorOf(under)}세트) 미만이고 회복 상태 양호 → 1세트 추가.`,
      citations: ['schoenfeld2017volume', 'pelland2024'],
    });
  }
  return { sets: Math.max(1, Math.min(6, sets)), reasons };
}
