import { getExercise } from '../domain/exercises';
import { MUSCLES, MUSCLE_LABEL, type Muscle, type Program, type ProgramExercise, type SetLog, type SplitId, type WorkoutSession } from '../domain/types';
import { matchExercise } from './importText';
import { recommendedRest } from './progression';
import { inferTrainingDays } from './recommend';
import { exerciseProgress, weeklySummary } from './stats';

/**
 * Claude 와 주고받기 (서버 없음, 복사·붙여넣기).
 * 보내기: 내 기록·추이·부위별 볼륨 + 조건 + "앱이 읽는 답변 형식" 을 한 덩어리 글로.
 * 받기: Claude 답변(### 루틴 / - 종목 | N세트 | a-b회 | Wkg | 휴식 S초, 또는 마크다운 표)을 읽어 루틴으로.
 */

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const p2 = (n: number) => String(n).padStart(2, '0');
const md = (ts: number) => {
  const d = new Date(ts);
  return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}(${WD[d.getDay()]})`.replace(/^0/, '');
};
const exName = (id: string) => getExercise(id)?.name ?? id;
const fmtSet = (w: number, r: number) => `${w}×${r}`;

export interface PromptInput {
  sessions: WorkoutSession[];
  sets: SetLog[];
  now: number;
  weeks?: number;
  program?: Program | null;
  maxMinutes?: number;
  priorities?: Muscle[];
  avoid?: string[];
  daysPerWeek?: number;
}

export function buildClaudePrompt(input: PromptInput): string {
  const { sessions, now, weeks = 8 } = input;
  const since = now - weeks * 7 * 86_400_000;
  const sets = input.sets.filter((s) => !s.warmup && s.completedAt >= since);
  const L: string[] = [];

  L.push('나는 근비대(근육 크기 키우기)가 목표야. 아래 내 실제 운동 기록을 보고, 근비대 연구(주간 세트 수, 반복 범위, 빈도, 휴식, 실패 근접도)에 맞춰 나에게 최적화된 루틴을 짜 줘.');
  L.push('불필요하게 겹치는 종목이나 과한 볼륨은 줄이고, 부족한 부위는 채워 줘. 종목마다 세트 수는 2~5세트 사이로 현실적으로.');
  L.push('');
  L.push('[조건]');
  const days = input.daysPerWeek ?? (sets.length ? inferTrainingDays(input.sets, now) : undefined);
  L.push(input.daysPerWeek ? `- 주 ${input.daysPerWeek}일 운동` : days ? `- 기록 기준 주 약 ${days}일 운동 (적절하면 그대로)` : '- 주당 운동 일수는 추천해 줘');
  if (input.maxMinutes) L.push(`- 한 번 운동은 ${input.maxMinutes}분 이내 (워밍업 포함)`);
  if (input.priorities?.length) L.push(`- 집중 부위: ${input.priorities.map((m) => MUSCLE_LABEL[m]).join(', ')}`);
  if (input.avoid?.length) L.push(`- 빼야 하는 종목(아프거나 불편함): ${input.avoid.map(exName).join(', ')}`);
  L.push('- RIR(실패까지 남은 횟수)은 따로 재지 않았어. 기록의 RIR 은 추정값');
  L.push('');

  L.push(`[최근 ${weeks}주 운동 기록] (워밍업 제외, 무게kg×횟수)`);
  if (sets.length === 0) L.push('기록 없음');
  const bySession = new Map<number, SetLog[]>();
  for (const s of [...sets].sort((a, b) => a.completedAt - b.completedAt)) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
  const sessionAt = (id: number, list: SetLog[]) => sessions.find((x) => x.id === id)?.startedAt ?? list[0]!.completedAt;
  for (const [id, list] of [...bySession].sort((a, b) => sessionAt(a[0], a[1]) - sessionAt(b[0], b[1]))) {
    const byEx = new Map<string, SetLog[]>();
    for (const s of list) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
    L.push(`${md(sessionAt(id, list))} ${[...byEx].map(([ex, xs]) => `${exName(ex)} ${xs.map((x) => fmtSet(x.weight, x.reps)).join(', ')}`).join(' / ')}`);
  }
  L.push('');

  const prog = exerciseProgress(sets, now);
  if (prog.length) {
    L.push('[종목별 추이] (첫 세션 → 최근 세션 최고 세트, 추정 1RM 변화)');
    for (const p of prog) L.push(`- ${p.name}: ${fmtSet(p.first.weight, p.first.reps)} → ${fmtSet(p.last.weight, p.last.reps)} (${p.changePct >= 0 ? '+' : ''}${p.changePct}%, ${p.sessions}회)`);
    L.push('');
    const recent = weeklySummary(input.sets, now, 4);
    const active = recent.filter((w) => w.sets > 0).length || 1;
    const avg = (m: Muscle) => Math.round((recent.reduce((a, w) => a + w.muscles[m], 0) / active) * 2) / 2;
    L.push('[최근 4주 평균 부위별 주간 세트] (직접 1, 보조 0.5)');
    L.push(MUSCLES.filter((m) => avg(m) > 0).map((m) => `${MUSCLE_LABEL[m]} ${avg(m)}`).join(', ') || '없음');
    L.push('');
  }

  if (input.program?.days.length) {
    L.push('[지금 하는 루틴]');
    for (const d of input.program.days) L.push(`${d.name}: ${d.exercises.map((e) => `${exName(e.exerciseId)} ${e.sets}세트(${e.repMin}-${e.repMax}회)`).join(', ')}`);
    L.push('');
  }

  L.push('[답변 형식] 루틴을 앱에 그대로 붙여넣을 거라, 루틴 부분은 꼭 아래 형식으로 써 줘. 표나 "4×8-10" 같은 다른 표기 말고 한 종목당 한 줄, 칸은 | 로 구분. 설명은 형식 밖에 자유롭게.');
  L.push('### 상체A');
  L.push('- 바벨 벤치프레스 | 4세트 | 6-10회 | 60kg | 휴식 150초');
  L.push('- 랫 풀다운 | 3세트 | 8-12회 | 50kg | 휴식 120초');
  L.push('### 하체A');
  L.push('- …');
  L.push('(종목 이름은 흔히 쓰는 한국어 이름, 무게는 내 기록 기준 첫 주 시작 무게. 루틴 이름은 ### 로 시작)');
  return L.join('\n');
}

// ─────────────────────────────── 받기

export interface PlanItem {
  rawName: string;
  exerciseId: string | null;
  sets: number;
  repMin: number;
  repMax: number;
  weight?: number;
  restSec?: number;
}

export interface PlanDay {
  name: string;
  items: PlanItem[];
}

export interface RoutinePlan {
  days: PlanDay[];
  /** 종목 줄처럼 보이지만 세트·반복을 못 읽은 줄 (사용자에게 보여줌) */
  skipped: string[];
}

const looksLikeItem = (line: string) => /^\s*(?:[-*•]|\d+[.)]|\|)/.test(line) && /[가-힣]{2,}/.test(line) && /\d/.test(line);

const HEADER_PATTERNS = [/^#{1,6}\s*(.+?)\s*:?$/, /^\*\*(.+?)\*\*\s*:?$/, /^\[(.+?)\]$/];
const cleanHeader = (s: string) => s.replace(/\*\*/g, '').replace(/[:：]$/, '').trim();

function readHeader(line: string): string | null {
  if (line.includes('|')) return null;
  for (const re of HEADER_PATTERNS) {
    const m = re.exec(line);
    if (m) return cleanHeader(m[1]!);
  }
  return null;
}

interface Fields {
  sets?: number;
  repMin?: number;
  repMax?: number;
  weight?: number;
  restSec?: number;
}

function readFields(parts: string[]): Fields {
  const f: Fields = {};
  for (let part of parts) {
    const rest = /(\d+(?:\.\d+)?)\s*(초|분|sec|s\b|min)/i.exec(part);
    if (rest && f.restSec === undefined) {
      const v = Number(rest[1]);
      f.restSec = /분|min/i.test(rest[2]!) ? Math.round(v * 60) : Math.round(v);
      part = part.replace(rest[0], ' ');
    }
    part = part.replace(/휴식/g, ' ');
    const w = /(\d+(?:\.\d+)?)\s*(?:kg|㎏|킬로)/i.exec(part);
    if (w && f.weight === undefined) {
      f.weight = Number(w[1]);
      part = part.replace(w[0], ' ');
    }
    const st = /(\d+)\s*(?:세트|sets?)/i.exec(part);
    if (st && f.sets === undefined) {
      f.sets = Number(st[1]);
      part = part.replace(st[0], ' ');
    }
    // N×a-b / N x a~b (세트×반복) — 범위보다 먼저 읽어야 "4×6-10" 의 4 를 놓치지 않음
    const sx = /(\d+)\s*[x×X*]\s*(\d+)(?:\s*[-~–]\s*(\d+))?\s*(?:회|reps?)?/i.exec(part);
    if (sx && f.sets === undefined) {
      f.sets = Number(sx[1]);
      f.repMin = Number(sx[2]);
      f.repMax = Number(sx[3] ?? sx[2]);
      part = part.replace(sx[0], ' ');
    }
    const range = /(\d+)\s*[-~–]\s*(\d+)\s*(?:회|reps?)?/i.exec(part);
    if (range && f.repMin === undefined) {
      f.repMin = Number(range[1]);
      f.repMax = Number(range[2]);
      part = part.replace(range[0], ' ');
    }
    const single = /(\d+)\s*(?:회|reps?)/i.exec(part);
    if (single && f.repMin === undefined) {
      f.repMin = f.repMax = Number(single[1]);
      part = part.replace(single[0], ' ');
    }
    // 단위 없는 숫자만 있는 칸 (표): 세트 → 반복 순
    const bare = /^\s*(\d+)\s*$/.exec(part);
    if (bare) {
      if (f.sets === undefined) f.sets = Number(bare[1]);
      else if (f.repMin === undefined) f.repMin = f.repMax = Number(bare[1]);
    }
  }
  return f;
}

function readItem(line: string): PlanItem | null {
  const body = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
  let name: string;
  let parts: string[];
  if (body.includes('|')) {
    const cells = body.split('|').map((c) => c.trim()).filter(Boolean);
    const idx = cells.findIndex((c) => /[가-힣a-z]{2,}/i.test(c) && !/^\d/.test(c));
    if (idx < 0) return null;
    name = cells[idx]!;
    parts = cells.slice(idx + 1);
  } else {
    const m = /^([^\d]+?)\s*(\d.*)$/.exec(body);
    if (!m) return null;
    name = m[1]!;
    parts = [m[2]!];
  }
  name = name.replace(/\*\*/g, '').replace(/[\s:：—–\-@(（]+$/, '').trim();
  if (!name || /^(종목|운동|exercise)$/i.test(name)) return null;
  const f = readFields(parts);
  if (f.sets === undefined || f.repMin === undefined || f.sets < 1 || f.sets > 10) return null;
  return {
    rawName: name,
    exerciseId: matchExercise(name),
    sets: f.sets,
    repMin: f.repMin,
    repMax: f.repMax ?? f.repMin,
    ...(f.weight !== undefined ? { weight: f.weight } : {}),
    ...(f.restSec !== undefined ? { restSec: f.restSec } : {}),
  };
}

export function parseRoutinePlan(text: string): RoutinePlan {
  const days: PlanDay[] = [];
  const skipped: string[] = [];
  let cur: PlanDay | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const header = readHeader(line);
    if (header) {
      cur = { name: header, items: [] };
      days.push(cur);
      continue;
    }
    const item = readItem(line);
    if (!item) {
      if (looksLikeItem(line)) skipped.push(line);
      continue;
    }
    if (!cur) {
      cur = { name: '루틴', items: [] };
      days.push(cur);
    }
    cur.items.push(item);
  }
  return { days: days.filter((d) => d.items.length > 0), skipped };
}

function guessSplit(days: PlanDay[]): SplitId {
  if (days.some((d) => /상체|하체/.test(d.name))) return 'upper_lower';
  return days.length <= 3 ? 'full_body' : 'ppl';
}

/** Claude 루틴 → 앱 루틴. 세트·반복·휴식은 Claude 답 그대로, 무게는 첫 처방 목표로 */
export function planToProgram(plan: RoutinePlan, now = Date.now(), priorities: Muscle[] = []): Program {
  return {
    name: 'Claude 루틴',
    splitId: guessSplit(plan.days),
    source: 'imported',
    createdAt: now,
    active: true,
    mesoStart: now,
    mesoWeeks: 4,
    priorities: priorities.slice(0, 5),
    days: plan.days.map((d, i) => ({
      id: `claude-${i}`,
      name: d.name,
      exercises: d.items
        .filter((it) => it.exerciseId && getExercise(it.exerciseId))
        .map((it): ProgramExercise => {
          const ex = getExercise(it.exerciseId!)!;
          return {
            exerciseId: ex.id,
            sets: it.sets,
            repMin: it.repMin,
            repMax: it.repMax,
            restSec: it.restSec ?? recommendedRest(ex),
            ...(it.weight !== undefined ? { targetWeight: it.weight, targetReps: it.repMin } : {}),
          };
        }),
    })),
  };
}
