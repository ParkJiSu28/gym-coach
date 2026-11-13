import { getExercise } from '../domain/exercises';
import { VOLUME_LANDMARKS } from '../domain/research';
import { MUSCLES, MUSCLE_LABEL, type Muscle, type Program, type SplitId } from '../domain/types';
import { matchExercise } from './importText';
import { recommendedRest, type Reason } from './progression';
import { defaultRepRange, programWeeklyVolume, volumeTarget } from './splits';

/**
 * 한 줄로 적은 루틴 글 → 루틴(요일)·종목·세트, 그리고 논문 기준 점검·수정안.
 * 예) "상체A 루틴 (펙덱플라이 45*15,50*15,55*10 3세트, 벤치프레스 50*8 5세트, …) 하체 A 루틴 (…)"
 */

export interface RoutineSet {
  weight: number;
  reps: number;
}

export interface RoutineEntry {
  rawName: string;
  exerciseId: string | null;
  sets: RoutineSet[];
  /** 수정안에서 새로 넣은 종목 (무게 기록 없음) */
  added?: boolean;
}

export interface RoutineDay {
  name: string;
  entries: RoutineEntry[];
}

// ─────────────────────────────── 읽기

const HEADER = /([가-힣]{1,4})\s*([A-Za-z0-9])\s*루틴/g;
const TOKEN = /(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+)|§(\d+)|[가-힣A-Za-z][가-힣A-Za-z_\s]*[가-힣A-Za-z]|[가-힣A-Za-z]/gi;

function normalizeBody(s: string): string {
  return s
    .replace(/(\d)\s*ㅅ[^가-힣\d]{0,2}트/g, '$1세트') // "3ㅅ[트" 오타
    .replace(/(?:슈퍼|수퍼)\s*세트/g, ' ')
    .replace(/(\d+\.\d+),(\d{1,2})(?![\d.]*\s*[*x×])/g, '$1*$2') // "57.5,8" 오타 → 57.5*8
    .replace(/(\d)\s*(?:kg|㎏|키로|킬로)/gi, '$1')
    .replace(/(\d)\s*(?:회|개|reps?)/gi, '$1')
    .replace(/(\d+)\s*세트/g, ' §$1 ');
}

const isName = (t: string) => (t.match(/[가-힣]/g) ?? []).length >= 2 || (t.match(/[a-z]/gi) ?? []).length >= 4;
const cleanName = (t: string) => t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

type Draft = RoutineEntry & { count?: number };

function parseBody(body: string): RoutineEntry[] {
  const out: Draft[] = [];
  let cur: Draft | null = null;
  for (const m of normalizeBody(body).matchAll(TOKEN)) {
    if (m[1] !== undefined) {
      cur?.sets.push({ weight: Number(m[1]), reps: Number(m[2]) });
    } else if (m[3] !== undefined) {
      if (cur) cur.count = Number(m[3]);
    } else if (isName(m[0])) {
      const rawName = cleanName(m[0]);
      cur = { rawName, exerciseId: matchExercise(rawName), sets: [] };
      out.push(cur);
    }
  }
  return out
    .filter((e) => e.sets.length > 0)
    .map(({ count, ...e }) => {
      const sets = [...e.sets];
      while (count && sets.length < count) sets.push({ ...sets.at(-1)! });
      return { ...e, sets };
    });
}

export function parseRoutineText(text: string): RoutineDay[] {
  if (!text.trim()) return [];
  const heads = [...text.matchAll(HEADER)];
  if (heads.length === 0) {
    const entries = parseBody(text);
    return entries.length ? [{ name: '루틴', entries }] : [];
  }
  return heads
    .map((h, i) => ({
      name: `${h[1]}${h[2]!.toUpperCase()}`,
      entries: parseBody(text.slice(h.index! + h[0].length, heads[i + 1]?.index ?? text.length)),
    }))
    .filter((d) => d.entries.length > 0);
}

// ─────────────────────────────── 본세트·다음 목표

/** 최고 무게의 60% 미만은 워밍업으로 보고 뺀다 */
export function workingSets(sets: RoutineSet[]): RoutineSet[] {
  const top = Math.max(0, ...sets.map((s) => s.weight));
  return sets.filter((s) => s.weight >= top * 0.6);
}

export interface NextTarget {
  exerciseId: string;
  day?: string;
  weight: number;
  reps: number;
  repMin: number;
  repMax: number;
  action: 'increase' | 'reps' | 'decrease';
  text: string;
}

/** 더블 프로그레션: 반복 범위 상한에 모두 닿으면 증량, 범위 안이면 반복 +1, 하한 미달이면 감량 */
export function nextTarget(exerciseId: string, sets: RoutineSet[]): NextTarget {
  const ex = getExercise(exerciseId);
  const [repMin, repMax] = ex ? defaultRepRange(ex) : [8, 12];
  // 어시스트 머신은 무게가 '보조'라 클수록 쉽다 → 증감 방향을 뒤집는다
  const inc = (ex?.increment || 2.5) * (exerciseId.startsWith('assisted_') ? -1 : 1);
  const work = workingSets(sets);
  const top = Math.max(...work.map((s) => s.weight));
  const minReps = Math.min(...work.filter((s) => s.weight === top).map((s) => s.reps));
  const base = { exerciseId, repMin, repMax };
  if (minReps >= repMax) {
    const w = Math.max(0, top + inc);
    const how = inc < 0 ? `보조 ${w}kg 로 줄여` : `${w}kg ×`;
    return { ...base, weight: w, reps: repMin, action: 'increase', text: `모든 세트 ${repMax}회 달성 → ${how} ${repMin}회부터` };
  }
  if (minReps < repMin) {
    const w = Math.max(0, top - inc);
    const how = inc < 0 ? `보조 ${w}kg 로 올려` : `${w}kg 로 낮춰`;
    return { ...base, weight: w, reps: repMin, action: 'decrease', text: `${repMin}회 미만 → ${how} ${repMin}~${repMax}회` };
  }
  return { ...base, weight: top, reps: minReps + 1, action: 'reps', text: `${top}kg 유지, 가장 적었던 세트를 ${minReps + 1}회로` };
}

// ─────────────────────────────── 앱 루틴으로

function guessSplit(days: RoutineDay[]): SplitId {
  if (days.some((d) => /상체|하체/.test(d.name))) return 'upper_lower';
  return days.length <= 3 ? 'full_body' : 'ppl';
}

export function routineToProgram(days: RoutineDay[], now = Date.now()): Program {
  return {
    name: '내 루틴 (가져옴)',
    splitId: guessSplit(days),
    createdAt: now,
    active: true,
    mesoStart: now,
    mesoWeeks: 4,
    priorities: [],
    days: days.map((d, i) => ({
      id: `import-${i}`,
      name: d.name,
      exercises: d.entries
        .filter((e) => e.exerciseId && getExercise(e.exerciseId))
        .map((e) => {
          const ex = getExercise(e.exerciseId!)!;
          const [repMin, repMax] = defaultRepRange(ex);
          const base = { exerciseId: ex.id, sets: workingSets(e.sets).length, repMin, repMax, restSec: recommendedRest(ex) };
          if (e.added || !e.sets.some((s) => s.weight > 0)) return base;
          const t = nextTarget(ex.id, e.sets);
          return { ...base, targetWeight: t.weight, targetReps: t.reps };
        }),
    })),
  };
}

// ─────────────────────────────── 점검·수정안

export interface RoutineChange {
  kind: 'remove' | 'sets' | 'add' | 'swap' | 'move';
  day: string;
  /** move: 옮겨 갈 루틴 */
  toDay?: string;
  exerciseId: string;
  toExerciseId?: string;
  from?: number;
  to?: number;
  text: string;
  citations: string[];
}

export interface RoutineAudit {
  before: Record<Muscle, number>;
  after: Record<Muscle, number>;
  changes: RoutineChange[];
  notes: Reason[];
  targets: NextTarget[];
  revised: RoutineDay[];
}

const VOL_CITES = ['schoenfeld2017volume', 'pelland2024', 'israetel_landmarks'];
const MAX_SETS_PER_EXERCISE = 5;
const ADD_PICK: Partial<Record<Muscle, string>> = {
  chest: 'machine_chest_press',
  side_delts: 'lateral_raise',
  rear_delts: 'face_pull',
  lats: 'lat_pulldown',
  upper_back: 'seated_cable_row',
  biceps: 'cable_curl',
  triceps: 'triceps_pushdown',
  quads: 'leg_extension',
  hamstrings: 'seated_leg_curl',
  glutes: 'hip_thrust',
  calves: 'standing_calf_raise',
};
const LOWER: Muscle[] = ['quads', 'hamstrings', 'glutes', 'calves'];

const exName = (id: string) => getExercise(id)?.name ?? id;
const primaryKey = (id: string) =>
  Object.entries(getExercise(id)?.muscles ?? {})
    .filter(([, c]) => c === 1)
    .map(([m]) => m)
    .sort()
    .join(',');
const volume = (days: RoutineDay[]) => programWeeklyVolume(routineToProgram(days, 0).days);
const nWork = (e: RoutineEntry) => workingSets(e.sets).length;
const known = (e: RoutineEntry) => !!e.exerciseId && !!getExercise(e.exerciseId);
const hits = (e: RoutineEntry, m: Muscle) => known(e) && getExercise(e.exerciseId!)!.muscles[m] === 1;
const daySets = (d: RoutineDay) => d.entries.reduce((s, e) => s + nWork(e), 0);

function dropSet(e: RoutineEntry) {
  const last = workingSets(e.sets).at(-1)!;
  e.sets.splice(e.sets.lastIndexOf(last), 1);
}

export function auditRoutine(days: RoutineDay[]): RoutineAudit {
  const revised: RoutineDay[] = days.map((d) => ({ name: d.name, entries: d.entries.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) })) }));
  const before = volume(days);
  const changes: RoutineChange[] = [];
  const notes: Reason[] = [];

  // 1) MRV 초과 부위: 같은 세션에 주동근이 같은 복합 운동이 겹치면 하나 뺀다 (세트 적은 쪽, 세션당 1개)
  for (const m of MUSCLES) {
    const l = VOLUME_LANDMARKS[m];
    for (const d of revised) {
      if (volume(revised)[m] <= l.mrv) break;
      const groups = new Map<string, RoutineEntry[]>();
      for (const e of d.entries.filter((x) => hits(x, m) && getExercise(x.exerciseId!)!.compound)) {
        const k = primaryKey(e.exerciseId!);
        groups.set(k, [...(groups.get(k) ?? []), e]);
      }
      const group = [...groups.values()].find((g) => g.length >= 2);
      if (!group) continue;
      const victim = [...group].sort((a, b) => nWork(a) - nWork(b) || group.indexOf(b) - group.indexOf(a))[0]!;
      const keep = group.find((e) => e !== victim)!;
      const trial = revised.map((x) => (x === d ? { ...x, entries: x.entries.filter((e) => e !== victim) } : x));
      if (volume(trial)[m] < l.mavLow) continue;
      d.entries = d.entries.filter((e) => e !== victim);
      changes.push({
        kind: 'remove',
        day: d.name,
        exerciseId: victim.exerciseId!,
        text: `${MUSCLE_LABEL[m]} 주 ${before[m]}세트로 회복 한계(MRV ${l.mrv}) 초과 — 같은 날 비슷한 동작(${exName(keep.exerciseId!)})이 있어 ${exName(victim.exerciseId!)} 빼기`,
        citations: VOL_CITES,
      });
    }
  }

  // 2) 그래도 MRV 초과면 세트를 1개씩 줄인다 (고립 운동 먼저 → 세트 많은 운동, 종목당 최소 2세트)
  const reduced = new Map<RoutineEntry, { day: string; from: number }>();
  for (const m of MUSCLES) {
    const l = VOLUME_LANDMARKS[m];
    for (let guard = 0; guard < 40 && volume(revised)[m] > l.mrv; guard++) {
      // 그 부위가 유일한 주동근인 종목만 줄인다 (스쿼트·데드를 둔근 때문에 줄이지 않도록)
      const cands = revised.flatMap((d) => d.entries.filter((e) => hits(e, m) && primaryKey(e.exerciseId!) === m && nWork(e) > 2).map((e) => ({ d, e })));
      if (cands.length === 0) break;
      cands.sort((a, b) => Number(getExercise(a.e.exerciseId!)!.compound) - Number(getExercise(b.e.exerciseId!)!.compound) || nWork(b.e) - nWork(a.e));
      const { d, e } = cands[0]!;
      if (!reduced.has(e)) reduced.set(e, { day: d.name, from: nWork(e) });
      dropSet(e);
    }
  }

  // 3) 라잉 레그컬만 있으면 하나를 시티드로 (Maeo 2021: 늘어난 자세의 시티드가 햄스트링 비대 더 큼)
  const ids = revised.flatMap((d) => d.entries.map((e) => e.exerciseId));
  if (ids.includes('lying_leg_curl') && !ids.includes('seated_leg_curl')) {
    const d = revised.find((x) => x.entries.some((e) => e.exerciseId === 'lying_leg_curl'))!;
    d.entries.find((x) => x.exerciseId === 'lying_leg_curl')!.exerciseId = 'seated_leg_curl';
    changes.push({
      kind: 'swap',
      day: d.name,
      exerciseId: 'lying_leg_curl',
      toExerciseId: 'seated_leg_curl',
      text: '엉덩이를 굽혀 햄스트링이 늘어난 자세로 하는 시티드 레그컬이 라잉보다 비대 효과가 컸음 — 한 번은 시티드로 (처음엔 무게를 낮춰서)',
      citations: ['maeo2021'],
    });
  }

  // 4) MEV 미만: 기존 종목 세트 추가(종목당 최대 5세트) → 없으면 새 종목 3세트
  const raised = new Map<RoutineEntry, { day: string; from: number }>();
  for (const m of MUSCLES) {
    const l = VOLUME_LANDMARKS[m];
    if (l.mev === 0 || volume(revised)[m] >= l.mev) continue;
    const target = volumeTarget(m, []);
    for (let guard = 0; guard < 20 && volume(revised)[m] < target; guard++) {
      const cands = revised.flatMap((d) => d.entries.filter((e) => hits(e, m) && nWork(e) < MAX_SETS_PER_EXERCISE).map((e) => ({ d, e })));
      if (cands.length > 0) {
        cands.sort((a, b) => nWork(a.e) - nWork(b.e));
        const { d, e } = cands[0]!;
        if (!raised.has(e) && !e.added) raised.set(e, { day: d.name, from: nWork(e) });
        e.sets.push({ ...workingSets(e.sets).at(-1)! });
        continue;
      }
      const pick = ADD_PICK[m];
      if (!pick) break;
      const pool = revised.filter((d) => (LOWER.includes(m) ? /하체|레그/.test(d.name) : /상체|가슴|등|어깨|팔/.test(d.name)));
      const d = [...(pool.length ? pool : revised)].sort((a, b) => daySets(a) - daySets(b))[0]!;
      const ex = getExercise(pick)!;
      const [, repMax] = defaultRepRange(ex);
      d.entries.push({ rawName: ex.name, exerciseId: pick, sets: Array.from({ length: 3 }, () => ({ weight: 0, reps: repMax })), added: true });
      changes.push({
        kind: 'add',
        day: d.name,
        exerciseId: pick,
        to: 3,
        text: `${MUSCLE_LABEL[m]} 주 ${before[m]}세트로 최소 유효량(MEV ${l.mev}) 미만 — ${ex.name} 3세트 추가`,
        citations: VOL_CITES,
      });
    }
  }

  const setText = (e: RoutineEntry, from: number, cond: (x: Muscle) => boolean, label: (x: Muscle) => string) =>
    `${MUSCLES.filter((x) => hits(e, x) && cond(x)).map((x) => `${MUSCLE_LABEL[x]} 주 ${before[x]}세트(${label(x)})`).join(', ')} — ${exName(e.exerciseId!)} ${from}→${nWork(e)}세트`;
  for (const [e, c] of reduced) {
    if (nWork(e) === c.from) continue;
    changes.push({ kind: 'sets', day: c.day, exerciseId: e.exerciseId!, from: c.from, to: nWork(e), text: setText(e, c.from, (x) => before[x] > VOLUME_LANDMARKS[x].mrv, (x) => `MRV ${VOLUME_LANDMARKS[x].mrv} 초과`), citations: VOL_CITES });
  }
  for (const [e, c] of raised) {
    changes.push({ kind: 'sets', day: c.day, exerciseId: e.exerciseId!, from: c.from, to: nWork(e), text: setText(e, c.from, (x) => before[x] < VOLUME_LANDMARKS[x].mev, (x) => `MEV ${VOLUME_LANDMARKS[x].mev} 미만`), citations: VOL_CITES });
  }

  // 5) 같은 부위 날(하체A·하체B 등) 사이에 한 부위 직접 세트가 4세트 이상 차이 나면 종목을 옮겨 고르게
  const region = (n: string) => n.replace(/\s*[A-Za-z0-9]$/, '');
  const direct = (d: RoutineDay, m: Muscle) => d.entries.filter((e) => hits(e, m)).reduce((s, e) => s + nWork(e), 0);
  const regions = new Map<string, RoutineDay[]>();
  for (const d of revised) regions.set(region(d.name), [...(regions.get(region(d.name)) ?? []), d]);
  for (const group of regions.values()) {
    if (group.length < 2) continue;
    const tried = new Set<string>();
    for (let guard = 0; guard < 12; guard++) {
      let best: { m: Muscle; h: RoutineDay; l: RoutineDay; diff: number } | null = null;
      for (const m of MUSCLES) {
        if (tried.has(m)) continue;
        const sorted = [...group].sort((a, b) => direct(b, m) - direct(a, m));
        const diff = direct(sorted[0]!, m) - direct(sorted.at(-1)!, m);
        if (diff >= 4 && (!best || diff > best.diff)) best = { m, h: sorted[0]!, l: sorted.at(-1)!, diff };
      }
      if (!best) break;
      const { m, h, l, diff } = best;
      const cands = h.entries
        .filter((e) => known(e) && primaryKey(e.exerciseId!) === m && !l.entries.some((x) => x.exerciseId === e.exerciseId))
        .map((e) => ({ e, gap: Math.abs(diff - 2 * nWork(e)), iso: !getExercise(e.exerciseId!)!.compound }))
        .filter((c) => c.gap < diff)
        .sort((a, b) => Number(b.iso) - Number(a.iso) || a.gap - b.gap);
      const pick = cands[0];
      if (!pick) {
        tried.add(m);
        continue;
      }
      const [a, b] = [direct(h, m), direct(l, m)];
      h.entries = h.entries.filter((e) => e !== pick.e);
      l.entries.push(pick.e);
      changes.push({
        kind: 'move',
        day: h.name,
        toDay: l.name,
        exerciseId: pick.e.exerciseId!,
        text: `${MUSCLE_LABEL[m]} 직접 세트가 ${h.name} ${a}세트 / ${l.name} ${b}세트로 한쪽에 몰림 — ${exName(pick.e.exerciseId!)}를 ${l.name}로 옮겨 ${direct(h, m)} / ${direct(l, m)}세트로 고르게 (주 2회 고른 자극)`,
        citations: ['schoenfeld2016freq', 'israetel_landmarks'],
      });
    }
  }

  // 참고 사항: 세션당 부위 직접 세트 과다, 주 1회만 자극하는 부위
  for (const d of revised) {
    for (const m of MUSCLES) {
      const direct = d.entries.filter((e) => hits(e, m)).reduce((s, e) => s + nWork(e), 0);
      if (direct > 10) {
        notes.push({ text: `${d.name}: ${MUSCLE_LABEL[m]} 한 세션 직접 ${direct}세트 — 세션당 10세트를 넘기면 추가 효과가 작아짐, 다른 날로 나누는 편이 좋음`, citations: ['israetel_landmarks', 'schoenfeld2016freq'] });
      }
    }
  }
  const after = volume(revised);
  for (const m of MUSCLES) {
    if (after[m] > VOLUME_LANDMARKS[m].mrv) {
      notes.push({ text: `${MUSCLE_LABEL[m]}: 수정 후에도 주 ${after[m]}세트(MRV ${VOLUME_LANDMARKS[m].mrv} 초과) — 복합 운동에서 함께 쓰이는 몫이 커서 고립 종목만 줄였음. 회복이 안 되면 복합 운동 세트도 줄이기`, citations: VOL_CITES });
    }
  }
  if (revised.length >= 2) {
    for (const m of MUSCLES) {
      const daysHit = revised.filter((d) => d.entries.some((e) => hits(e, m))).length;
      if (daysHit === 1 && after[m] >= 8) notes.push({ text: `${MUSCLE_LABEL[m]}: 주 1회만 직접 자극 — 같은 세트 수를 주 2회로 나누면 근비대에 유리`, citations: ['schoenfeld2016freq'] });
    }
  }

  const targets: NextTarget[] = days.flatMap((d) =>
    d.entries.filter((e) => known(e) && e.sets.some((s) => s.weight > 0)).map((e) => ({ ...nextTarget(e.exerciseId!, e.sets), day: d.name })),
  );

  return { before, after, changes, notes, targets, revised };
}
