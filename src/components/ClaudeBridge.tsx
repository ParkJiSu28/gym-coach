import { useMemo, useRef, useState } from 'react';
import { saveActiveProgram } from '../data/db';
import { useActiveProgram, useAllSets, useNow, useSessions } from '../data/hooks';
import { allExercises, getExercise } from '../domain/exercises';
import { MUSCLES, MUSCLE_LABEL, type Muscle } from '../domain/types';
import { buildClaudePrompt, parseRoutinePlan, planToProgram, type RoutinePlan } from '../engine/claudeBridge';
import { AVOID_PRESETS } from '../engine/routineImport';
import { Badge, Button, Card } from './ui';

const boxCls = 'w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-base outline-none focus:border-emerald-500';
const chip = (on: boolean, tone: 'emerald' | 'rose' = 'emerald') =>
  `rounded-full border px-3 py-1 text-sm disabled:opacity-40 ${on ? (tone === 'emerald' ? 'border-emerald-500 bg-emerald-950 text-emerald-300' : 'border-rose-400 bg-rose-950 text-rose-300') : 'border-slate-700 bg-slate-950 text-slate-300'}`;
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** ① 내 기록을 Claude 질문 글로 복사 → ② Claude 답변 붙여넣기 → 루틴으로 저장 */
export function ClaudeBridge({ onSaved }: { onSaved?: () => void }) {
  const sets = useAllSets();
  const sessions = useSessions();
  const program = useActiveProgram();
  const now = useNow(60_000);
  const exercises = useMemo(() => [...allExercises()].sort((a, b) => a.name.localeCompare(b.name, 'ko')), []);

  const [daysPerWeek, setDaysPerWeek] = useState('');
  const [maxMin, setMaxMin] = useState('');
  const [priorities, setPriorities] = useState<Muscle[]>([]);
  const [presets, setPresets] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [answer, setAnswer] = useState('');
  const [plan, setPlan] = useState<RoutinePlan | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const prompt = useMemo(
    () =>
      buildClaudePrompt({
        sessions,
        sets,
        now,
        program,
        daysPerWeek: Number(daysPerWeek) || undefined,
        maxMinutes: Number(maxMin) >= 15 ? Number(maxMin) : undefined,
        priorities,
        avoid: AVOID_PRESETS.filter((p) => presets.includes(p.id)).flatMap((p) => p.ids),
      }),
    [sessions, sets, now, program, daysPerWeek, maxMin, priorities, presets],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      promptRef.current?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
  }

  function read() {
    const p = parseRoutinePlan(answer);
    setPlan(p.days.length ? p : null);
    setMsg(p.days.length ? null : { ok: false, text: '루틴을 찾지 못했습니다. "### 루틴이름" 아래 "- 종목 | 4세트 | 6-10회" 형식인지 확인하세요.' });
  }

  function setItemExercise(di: number, ii: number, id: string) {
    setPlan((p) => p && { days: p.days.map((d, i) => (i !== di ? d : { ...d, items: d.items.map((it, j) => (j === ii ? { ...it, exerciseId: id || null } : it)) })) });
  }

  async function save() {
    if (!plan) return;
    await saveActiveProgram(planToProgram(plan, Date.now(), priorities));
    setMsg({ ok: true, text: '루틴으로 저장했습니다. 오늘 탭에서 할 루틴을 고르세요.' });
    setPlan(null);
    setAnswer('');
    onSaved?.();
  }

  const unmatched = plan?.days.flatMap((d) => d.items.filter((i) => !i.exerciseId)).length ?? 0;

  return (
    <Card title="Claude에게 루틴 받기">
      <div className="rounded-xl bg-slate-950/50 p-3">
        <p className="mb-2 text-sm font-semibold">① 내 기록 복사 → Claude에 붙여넣기</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <label className="flex items-center gap-1">
            주
            <select aria-label="주당 운동 일수" value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)} className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2">
              <option value="">기록대로</option>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            일
          </label>
          <label className="flex items-center gap-1">
            한 번
            <input
              aria-label="Claude 운동 시간 제한(분)"
              type="number"
              inputMode="numeric"
              placeholder="제한 없음"
              value={maxMin}
              onChange={(e) => setMaxMin(e.target.value)}
              className="h-9 w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 text-center"
            />
            분
          </label>
        </div>
        <p className="mt-2 mb-1 text-xs text-slate-400">집중 부위 (최대 5개 · {priorities.length}/5)</p>
        <div role="group" aria-label="Claude 집중 부위" className="flex flex-wrap gap-1.5">
          {MUSCLES.map((m) => (
            <button key={m} type="button" aria-pressed={priorities.includes(m)} disabled={!priorities.includes(m) && priorities.length >= 5} onClick={() => setPriorities((p) => toggle(p, m))} className={chip(priorities.includes(m))}>
              {MUSCLE_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="mt-2 mb-1 text-xs text-slate-400">빼고 싶은 종목 (아프거나 불편한 곳)</p>
        <div className="flex flex-wrap gap-1.5">
          {AVOID_PRESETS.map((p) => (
            <button key={p.id} type="button" aria-pressed={presets.includes(p.id)} title={p.desc} onClick={() => setPresets((x) => toggle(x, p.id))} className={chip(presets.includes(p.id), 'rose')}>
              {p.label}
            </button>
          ))}
        </div>
        <textarea ref={promptRef} aria-label="Claude에 보낼 글" readOnly value={prompt} rows={5} onFocus={(e) => e.currentTarget.select()} className={`${boxCls} mt-3 text-xs`} />
        <Button className="mt-2 w-full" onClick={copy}>
          {copied ? '복사됨 — Claude 대화창에 붙여넣으세요' : '내 기록 복사'}
        </Button>
        <p className="mt-1 text-xs text-slate-500">최근 8주 기록·종목별 추이·부위별 주간 세트·지금 루틴과, 앱이 읽을 수 있는 답변 형식이 함께 들어갑니다.</p>
      </div>

      <div className="mt-3 rounded-xl bg-slate-950/50 p-3">
        <p className="mb-2 text-sm font-semibold">② Claude 답변 붙여넣기 → 루틴으로 저장</p>
        <textarea aria-label="Claude 답변" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} placeholder={'### 상체A\n- 바벨 벤치프레스 | 4세트 | 6-10회 | 60kg | 휴식 150초'} className={`${boxCls} text-sm`} />
        <Button variant="ghost" className="mt-2 w-full" onClick={read} disabled={!answer.trim()}>
          답변 읽기
        </Button>
        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
            {msg.ok ? '✓ ' : ''}
            {msg.text}
          </p>
        )}
        {plan && (
          <div className="mt-3 space-y-2">
            {unmatched > 0 && <Badge tone="amber">인식 못한 종목 {unmatched}개 — 골라 주세요 (안 고르면 빠짐)</Badge>}
            {plan.days.map((d, di) => (
              <div key={d.name + di} className="rounded-lg border border-slate-800 p-2">
                <p className="mb-1 text-sm font-semibold">{d.name}</p>
                <ul className="space-y-1 text-sm">
                  {d.items.map((it, ii) => (
                    <li key={ii} className="flex flex-wrap items-center justify-between gap-1">
                      {it.exerciseId ? (
                        <span>{getExercise(it.exerciseId)?.name}</span>
                      ) : (
                        <select aria-label={`${it.rawName} 종목 선택`} value="" onChange={(e) => setItemExercise(di, ii, e.target.value)} className="h-9 rounded-lg border border-amber-600 bg-slate-950 px-2 text-base">
                          <option value="">"{it.rawName}" → 종목 선택</option>
                          {exercises.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <span className="text-xs tabular-nums text-slate-400">
                        {it.sets}세트 · {it.repMin === it.repMax ? it.repMin : `${it.repMin}-${it.repMax}`}회{it.weight !== undefined ? ` · ${it.weight}kg` : ''}
                        {it.restSec ? ` · 휴식 ${it.restSec}초` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <Button className="w-full" onClick={save}>
              이 루틴으로 저장
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
