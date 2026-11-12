import type { Checkin, Program, SetLog } from '../domain/types';
import { readinessScore, systemicLoad } from './fatigue';
import { exerciseHistory, mesoPosition, sessionBestE1RM, type ExerciseSession, type Reason } from './progression';
import { DAY_MS } from './volume';

// ─────────────────────────────── 정체 감지

export interface PlateauResult {
  plateau: boolean;
  sessionsSincePR: number;
  bestE1RM: number;
}

/** 최근 3세션 동안 추정 1RM 이 이전 최고치를 0.5% 이상 넘지 못하면 정체 */
export function detectPlateau(history: ExerciseSession[], window = 3): PlateauResult {
  const e1s = history.map(sessionBestE1RM);
  const best = Math.max(0, ...e1s);
  let lastPrIdx = -1;
  let running = 0;
  e1s.forEach((v, i) => {
    if (v > running * 1.005) {
      running = v;
      lastPrIdx = i;
    }
  });
  const sessionsSincePR = lastPrIdx < 0 ? 0 : e1s.length - 1 - lastPrIdx;
  return { plateau: history.length > window && sessionsSincePR >= window, sessionsSincePR, bestE1RM: best };
}

export const PLATEAU_TIPS: Reason[] = [
  { text: '반복 범위를 바꿔보세요 (예: 6~8회 ↔ 10~15회). 실패 근접 시 넓은 범위가 모두 근비대에 유효합니다.', citations: ['schoenfeld2017load'] },
  { text: '주간 볼륨이 최적 범위 하한이면 해당 부위에 주 2~4세트 추가를 고려하세요.', citations: ['schoenfeld2017volume', 'bazvalle2022'] },
  { text: '근육별 주 2회 이상 자극되는지 분할을 점검하세요.', citations: ['schoenfeld2016freq'] },
  { text: '피로가 쌓였다면 디로딩 1주 후 재개하면 수행이 회복되는 경우가 많습니다.', citations: ['bell2023'] },
];

// ─────────────────────────────── 디로딩 판단

export interface DeloadAdvice {
  recommend: boolean;
  scheduled: boolean;
  signals: Reason[];
}

export function deloadAdvice(params: {
  program?: Program;
  sets: SetLog[];
  checkins: Checkin[];
  now: number;
}): DeloadAdvice {
  const { program, sets, checkins, now } = params;
  const signals: Reason[] = [];
  const scheduled = program ? mesoPosition(program, now).isDeload : false;
  if (scheduled) {
    signals.push({ text: '메소사이클 마지막 주 — 계획된 디로딩 주입니다.', citations: ['bell2023'] });
  }

  // 최근 10일 내 수행 하락 종목 수
  const recent = sets.filter((s) => s.completedAt > now - 10 * DAY_MS);
  const exIds = [...new Set(recent.map((s) => s.exerciseId))];
  let drops = 0;
  for (const id of exIds) {
    const h = exerciseHistory(sets, id).filter((x) => x.date <= now);
    if (h.length < 2) continue;
    const last = h.at(-1)!;
    const prev = h.at(-2)!;
    if (last.date > now - 10 * DAY_MS && sessionBestE1RM(last) < sessionBestE1RM(prev) * 0.95) drops += 1;
  }
  if (drops >= 2) {
    signals.push({ text: `최근 10일간 ${drops}개 종목에서 추정 1RM 이 5% 이상 하락했습니다.`, citations: ['bell2023'] });
  }

  const lastChecks = [...checkins].sort((a, b) => b.date - a.date).slice(0, 3);
  const scores = lastChecks.map((c) => readinessScore(c)).filter((v): v is number => v !== null);
  const lowReadiness = scores.length >= 3 && scores.reduce((a, b) => a + b, 0) / scores.length < 40;
  if (lowReadiness) {
    signals.push({ text: '최근 3회 컨디션 체크인 평균이 낮습니다 (수면·근육통·의욕·스트레스).', citations: ['bell2023', 'helms2016'] });
  }

  const load = systemicLoad(sets, now);
  if (load.level === 'high') {
    signals.push({
      text: `이번 주 하드 세트(${load.acute})가 평소 주평균(${load.chronic})의 ${load.ratio}배 — 급격한 볼륨 증가.`,
      citations: ['app_fatigue_model'],
    });
  }

  const unscheduled = signals.length - (scheduled ? 1 : 0);
  const recommend = scheduled || drops >= 2 || unscheduled >= 2;
  return { recommend, scheduled, signals };
}
