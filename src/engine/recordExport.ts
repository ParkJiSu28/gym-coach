import { getExercise } from '../domain/exercises';
import type { Program, SetLog, WorkoutSession } from '../domain/types';

/** 루틴·날짜를 골라 운동 기록을 한 번에 내려받기 (텍스트 복사) */

export interface RoutineOption {
  key: string;
  label: string;
  /** 세트가 있는 수행 횟수 */
  count: number;
}

export interface ExportData {
  programs: Program[];
  sessions: WorkoutSession[];
  sets: SetLog[];
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const p2 = (n: number) => String(n).padStart(2, '0');
export const longDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}(${WD[d.getDay()]})`;
};
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${p2(Math.round(sec % 60))}`;
const exName = (id: string) => getExercise(id)?.name ?? id;

/** 세션이 속한 루틴 키: "프로그램id:날id" / 자유 운동 / 직접 입력 */
export function routineKey(s: WorkoutSession): string {
  if (s.manual) return 'manual';
  if (s.dayId) return `${s.programId ?? ''}:${s.dayId}`;
  return 'free';
}

function dayOf(programs: Program[], s: WorkoutSession) {
  const p = programs.find((x) => x.id === s.programId);
  return { program: p, day: p?.days.find((d) => d.id === s.dayId) };
}

function labelFor(key: string, programs: Program[], sample: WorkoutSession): string {
  if (key === 'manual') return '직접 입력 기록';
  if (key === 'free') return '자유 운동';
  const { program, day } = dayOf(programs, sample);
  if (!day) return '삭제된 루틴';
  return program?.active ? day.name : `${day.name} (이전 루틴)`;
}

const withSets = (sessions: WorkoutSession[], sets: SetLog[]) => {
  const ids = new Set(sets.map((x) => x.sessionId));
  return sessions.filter((s) => s.id !== undefined && ids.has(s.id));
};

/** 기록이 있는 루틴 목록 (현재 루틴의 날 순서 → 이전 루틴 → 자유 운동 → 직접 입력) */
export function routineOptions(programs: Program[], sessions: WorkoutSession[], sets: SetLog[]): RoutineOption[] {
  const groups = new Map<string, WorkoutSession[]>();
  for (const s of withSets(sessions, sets)) groups.set(routineKey(s), [...(groups.get(routineKey(s)) ?? []), s]);
  const rank = (key: string, sample: WorkoutSession) => {
    if (key === 'manual') return 1e6 + 1;
    if (key === 'free') return 1e6;
    const { program, day } = dayOf(programs, sample);
    if (!program || !day) return 9e5;
    return (program.active ? 0 : 1e3 * (1 + programs.indexOf(program))) + program.days.indexOf(day);
  };
  return [...groups.entries()]
    .map(([key, ss]) => ({ key, label: labelFor(key, programs, ss[0]!), count: ss.length, r: rank(key, ss[0]!) }))
    .sort((a, b) => a.r - b.r)
    .map(({ key, label, count }) => ({ key, label, count }));
}

/** 고른 루틴들의 수행 세션 (최신순, 세트 있는 것만) */
export function sessionsFor(keys: string[], sessions: WorkoutSession[], sets: SetLog[]): WorkoutSession[] {
  const k = new Set(keys);
  return withSets(sessions, sets)
    .filter((s) => k.has(routineKey(s)))
    .sort((a, b) => b.startedAt - a.startedAt);
}

function picked(ids: number[], data: ExportData) {
  const want = new Set(ids);
  return data.sessions
    .filter((s) => s.id !== undefined && want.has(s.id))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => ({
      s,
      name: labelFor(routineKey(s), data.programs, s),
      day: dayOf(data.programs, s).day,
      sets: data.sets.filter((x) => x.sessionId === s.id).sort((a, b) => a.completedAt - b.completedAt),
    }));
}

/** 사람이 읽는 (그리고 Claude에 붙여넣기 좋은) 텍스트 */
export function exportText(ids: number[], data: ExportData): string {
  const rows = picked(ids, data);
  const L = [`[운동 기록 ${rows.length}회] (RIR = 더 할 수 있었던 횟수, W = 워밍업, 휴식 = 앞 세트 끝난 뒤 쉰 시간)`, ''];
  for (const { s, name, day, sets } of rows) {
    const min = s.endedAt && !s.manual ? ` · ${Math.round((s.endedAt - s.startedAt) / 60_000)}분` : '';
    L.push(`■ ${longDate(s.startedAt)} ${name}${min}`);
    const byEx = new Map<string, SetLog[]>();
    for (const x of sets) byEx.set(x.exerciseId, [...(byEx.get(x.exerciseId) ?? []), x]);
    for (const [ex, xs] of byEx) {
      const pe = day?.exercises.find((e) => e.exerciseId === ex);
      L.push(`- ${exName(ex)}${pe ? ` (계획 ${pe.sets}세트 ${pe.repMin}-${pe.repMax}회, 휴식 ${pe.restSec}초)` : ''}`);
      let n = 0;
      xs.forEach((x, i) => {
        const label = x.warmup ? 'W' : `${++n}세트`;
        const rest = i > 0 && x.restSec !== undefined ? ` 휴식 ${mmss(x.restSec)}` : '';
        L.push(`  ${label} ${x.weight}kg×${x.reps}회 RIR ${x.rir}${x.rirEstimated ? '(추정)' : ''}${rest}`);
      });
    }
    L.push('');
  }
  return L.join('\n');
}
