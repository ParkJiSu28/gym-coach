import { getExercise } from '../domain/exercises';
import { VOLUME_LANDMARKS } from '../domain/research';
import { MUSCLES, MUSCLE_LABEL, type Muscle, type SetLog } from '../domain/types';
import type { Reason } from './progression';
import { isHardSet, muscleFrequency, volumeStatus, weeklyVolume, WEEK_MS, type VolumeStatus } from './volume';

export interface MuscleReport {
  muscle: Muscle;
  /** 최근 7일 환산 세트 */
  weeklySets: number;
  /** 최근 7일 직접 자극 일수 */
  frequency: number;
  status: VolumeStatus;
  mavLow: number;
  mavHigh: number;
  action: Reason;
}

export interface Report {
  hasData: boolean;
  muscles: MuscleReport[];
  tips: Reason[];
}

const SEVERITY: Record<VolumeStatus, number> = { below_mev: 0, over_mrv: 1, low: 2, high: 3, optimal: 4 };
const VOLUME_CITES = ['schoenfeld2017volume', 'bazvalle2022'];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function muscleAction(m: Muscle, v: number, freq: number, status: VolumeStatus): Reason {
  const l = VOLUME_LANDMARKS[m];
  const freqNote = v > 0 && freq < 2 ? ' 주 1회에 몰려 있으니 주 2회로 나눠서 하세요.' : '';
  const freqCite = freqNote ? ['schoenfeld2016freq'] : [];
  switch (status) {
    case 'below_mev':
      return {
        text: `주 ${fmt(v)}세트 — 최소 효과 볼륨(${l.mev}세트) 미만입니다. 최적 범위 ${l.mavLow}~${l.mavHigh}세트까지 +${Math.ceil(l.mavLow - v)}세트 늘리세요.${freqNote}`,
        citations: [...VOLUME_CITES, ...freqCite],
      };
    case 'low':
      if (l.mev === 0) {
        return { text: `주 ${fmt(v)}세트 — 다른 종목의 간접 자극으로 충분한 부위입니다. 현재 유지.`, citations: ['pelland2024'] };
      }
      return {
        text: `주 ${fmt(v)}세트 — 최적 범위 하한(${l.mavLow}세트)보다 적습니다. +${Math.ceil(l.mavLow - v)}세트 늘리면 근비대에 유리합니다.${freqNote}`,
        citations: [...VOLUME_CITES, ...freqCite],
      };
    case 'optimal':
      return {
        text: `주 ${fmt(v)}세트 — 최적 범위(${l.mavLow}~${l.mavHigh}세트)입니다. 현재 볼륨 유지.${freqNote}`,
        citations: [...VOLUME_CITES, ...freqCite],
      };
    case 'high':
      return {
        text: `주 ${fmt(v)}세트 — 최적 범위 상한을 넘었습니다. 추가 이득은 점점 작아지니 수행이 떨어지면 세트를 줄이세요.`,
        citations: ['pelland2024', 'israetel_landmarks'],
      };
    case 'over_mrv':
      return {
        text: `주 ${fmt(v)}세트 — 회복 한계 추정치(${l.mrv}세트)를 넘었습니다. −${Math.ceil(v - l.mavHigh)}세트 줄이세요.`,
        citations: ['israetel_landmarks', 'bazvalle2022'],
      };
  }
}

export function buildReport({ sets, now }: { sets: SetLog[]; now: number }): Report {
  const recent = sets.filter((s) => s.completedAt <= now && s.completedAt > now - 4 * WEEK_MS && isHardSet(s));
  if (recent.length === 0) return { hasData: false, muscles: [], tips: [] };

  const weekly = weeklyVolume(sets, now);
  const freq = muscleFrequency(sets, now - WEEK_MS, now + 1);

  const trained = new Set<Muscle>();
  for (const s of recent) {
    const ex = getExercise(s.exerciseId);
    if (ex) for (const m of Object.keys(ex.muscles) as Muscle[]) trained.add(m);
  }

  const muscles: MuscleReport[] = MUSCLES.filter((m) => trained.has(m))
    .map((m) => {
      const v = weekly[m];
      const status = volumeStatus(m, v);
      const l = VOLUME_LANDMARKS[m];
      return { muscle: m, weeklySets: v, frequency: freq[m], status, mavLow: l.mavLow, mavHigh: l.mavHigh, action: muscleAction(m, v, freq[m], status) };
    })
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.weeklySets - b.weeklySets);

  return { hasData: true, muscles, tips: trainingTips(recent) };
}

function trainingTips(recent: SetLog[]): Reason[] {
  const tips: Reason[] = [];

  const lowRep = recent.filter((s) => s.reps < 6).length / recent.length;
  if (lowRep > 0.3) {
    tips.push({
      text: `하드 세트의 ${Math.round(lowRep * 100)}%가 5회 이하입니다. 근비대가 목표라면 6~30회(특히 6~12회) 위주가 시간 대비 효율적이고 관절 부담도 적습니다.`,
      citations: ['schoenfeld2021continuum', 'schoenfeld2017load'],
    });
  }

  const rests = recent.map((s) => s.restSec).filter((r): r is number => r !== undefined && r < 1200);
  if (rests.length >= 3) {
    const avg = rests.reduce((a, b) => a + b, 0) / rests.length;
    if (avg < 90) {
      tips.push({
        text: `평균 휴식 ${Math.round(avg)}초 — 짧습니다. 복합 운동 2~3분, 고립 운동 1.5~2분 쉬면 세트당 반복 수가 유지되어 총 자극이 늘어납니다.`,
        citations: ['singer2024', 'schoenfeld2016rest'],
      });
    }
  }

  const estimated = recent.filter((s) => s.rirEstimated).length / recent.length;
  if (estimated > 0.5) {
    tips.push({
      text: 'RIR(실패까지 남은 횟수)을 대부분 기록하지 않았습니다. 세트마다 "몇 개 더 할 수 있었나"를 고르면 처방이 정확해지고, 기록할수록 추정도 정확해집니다.',
      citations: ['halperin2022', 'robinson2024'],
    });
  }

  // 종목 다양성: 직접 자극 종목이 하나뿐인 부위 (3세션 이상)
  const byMuscle = new Map<Muscle, { ex: Set<string>; sessions: Set<number> }>();
  for (const s of recent) {
    const ex = getExercise(s.exerciseId);
    if (!ex) continue;
    for (const [m, c] of Object.entries(ex.muscles) as [Muscle, number][]) {
      if (c < 1) continue;
      const cur = byMuscle.get(m) ?? { ex: new Set(), sessions: new Set() };
      cur.ex.add(s.exerciseId);
      cur.sessions.add(s.sessionId);
      byMuscle.set(m, cur);
    }
  }
  const mono = [...byMuscle.entries()].filter(([, v]) => v.ex.size === 1 && v.sessions.size >= 3).map(([m]) => MUSCLE_LABEL[m]);
  if (mono.length > 0) {
    tips.push({
      text: `${mono.join(', ')}을(를) 한 종목으로만 훈련하고 있습니다. 같은 부위에 2가지 종목을 섞으면 근육의 여러 부위가 고르게 발달할 수 있습니다 (운동 중 "교체" 버튼 활용).`,
      citations: ['kassiano2022'],
    });
  }

  const ids = new Set(recent.map((s) => s.exerciseId));
  if (ids.has('lying_leg_curl') && !ids.has('seated_leg_curl')) {
    tips.push({
      text: '햄스트링은 라잉 레그 컬보다 시티드 레그 컬(근육이 늘어난 위치)에서 더 크게 성장했습니다. 교체를 고려하세요.',
      citations: ['maeo2021', 'pedrosa2022'],
    });
  }

  return tips;
}
