import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tab } from '../App';
import { ManualEntryForm, ManualEntryList, PastRecordsShortcut } from '../components/ManualEntry';
import { PasteImport } from '../components/PasteImport';
import { TransferCard } from '../components/TransferCard';
import { RestTimer } from '../components/RestTimer';
import { Badge, Button, Card, Empty, Stepper, WhyCard, fmtDuration } from '../components/ui';
import { addSessionExercise, createCustomExercise, db, deleteSession, removeSessionExercise, finishSession, logSet, setSessionOrder, setSessionRest, startSession, swapExercise, updateSet } from '../data/db';
import { useActiveProgram, useAllSets, useCheckins, useNow, useOpenSession, useSessions } from '../data/hooks';
import { allExercises, getExercise } from '../domain/exercises';
import { MUSCLES, MUSCLE_LABEL, type Muscle, type ProgramExercise, type SetLog } from '../domain/types';
import { buildContext, planExercise, type ExercisePlan } from '../engine/planner';
import { ACTION_LABEL, exerciseHistory, recommendedRest } from '../engine/progression';
import { DEFAULT_UNKNOWN_RIR, ManualRecordError } from '../engine/records';
import { scheduledDayFor } from '../engine/schedule';
import { defaultRepRange, nextProgramDay } from '../engine/splits';
import { alternativesFor, replaceInProgram } from '../engine/swap';
import { applyOrder, clampRest, moveIndex, setDayRest } from '../engine/sessionEdit';
import { DragList } from '../components/DragList';
import { keepScreenOn, unlockAudio } from '../lib/alert';

/** 화면에 표시할 종목 칸: 실제 수행 종목 id + (있다면) 원래 계획 종목 id */
interface Slot {
  id: string;
  plannedId?: string;
  pe?: ProgramExercise;
}

export function LogPage({ go }: { go: (t: Tab) => void }) {
  const open = useOpenSession();
  const program = useActiveProgram();
  const sessions = useSessions();
  const allSets = useAllSets();
  const checkins = useCheckins();
  const now = useNow(1000);
  const [picker, setPicker] = useState(false);
  const [swapping, setSwapping] = useState<Slot | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 1분 단위(또는 데이터 변경 시)로만 컨텍스트 재계산 — 타이머 매초 갱신과 분리
  const minute = Math.floor(now / 60_000);
  const ctx = useMemo(
    () => buildContext({ now: Date.now(), sets: allSets, checkins, program: program ?? undefined, excludeSessionId: open?.id }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- minute 는 주기적 재계산 트리거
    [minute, allSets, checkins, program, open?.id],
  );

  const sessionSets = useMemo(() => (open?.id ? allSets.filter((s) => s.sessionId === open.id) : []), [allSets, open?.id]);
  const day = program && open && open.programId === program.id ? program.days.find((d) => d.id === open.dayId) : undefined;

  const slots = useMemo<Slot[]>(() => {
    const swaps = open?.swaps ?? {};
    const removed = new Set(open?.removed ?? []);
    const out: Slot[] = [];
    for (const pe of day?.exercises ?? []) {
      const to = swaps[pe.exerciseId];
      const ex = to ? getExercise(to) : undefined;
      if (to && ex) {
        const [repMin, repMax] = defaultRepRange(ex);
        out.push({ id: to, plannedId: pe.exerciseId, pe: { ...pe, exerciseId: to, repMin, repMax, restSec: recommendedRest(ex) } });
      } else out.push({ id: pe.exerciseId, plannedId: pe.exerciseId, pe });
    }
    for (const id of [...sessionSets.map((s) => s.exerciseId), ...(open?.added ?? []).map((x) => swaps[x] ?? x)]) {
      if (!out.some((s) => s.id === id)) out.push({ id });
    }
    const visible = out.filter((s) => !removed.has(s.id) || sessionSets.some((x) => x.exerciseId === s.id));
    const ids = applyOrder(visible.map((s) => s.id), open?.order);
    return ids.map((id) => visible.find((s) => s.id === id)!);
  }, [day, sessionSets, open?.added, open?.removed, open?.swaps, open?.order]);

  const plans = useMemo(
    () => slots.map((slot) => ({ slot, plan: planExercise(ctx, slot.id, slot.pe) })).filter((x): x is { slot: Slot; plan: ExercisePlan } => x.plan !== null),
    [slots, ctx],
  );

  // 운동 중 화면 꺼짐 방지
  useEffect(() => {
    if (!open) return;
    let release: () => void = () => undefined;
    const acquire = () => void keepScreenOn().then((r) => (release = r));
    acquire();
    const onVis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      release();
    };
  }, [open]);

  if (open === undefined) return null;

  if (open === null) {
    const today = program ? scheduledDayFor(program, Date.now()) : undefined;
    const nextDay = today ?? (program ? nextProgramDay(program, sessions) : undefined);
    const begin = (init?: { programId?: number; dayId?: string }) => {
      unlockAudio();
      return startSession(init);
    };
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">운동 기록</h1>
        <PastRecordsShortcut />
        <Card title="운동 시작">
          <div className="space-y-2">
            {program?.id && nextDay && (
              <Button className="w-full py-3 text-base" onClick={() => begin({ programId: program.id, dayId: nextDay.id })}>
                루틴 시작: {nextDay.name}
              </Button>
            )}
            {program?.days
              .filter((d) => d.id !== nextDay?.id)
              .map((d) => (
                <Button key={d.id} variant="ghost" className="w-full" onClick={() => begin({ programId: program.id, dayId: d.id })}>
                  {d.name}
                </Button>
              ))}
            <Button variant="subtle" className="w-full" onClick={() => begin()}>
              자유 운동 시작
            </Button>
          </div>
        </Card>
        <PasteImport />
        <ManualEntryForm />
        <ManualEntryList />
        <TransferCard />
      </div>
    );
  }

  const lastSet = sessionSets.at(-1);
  const restOf = (plan: ExercisePlan) => open.rest?.[plan.exercise.id] ?? plan.restSec;
  const lastPlan = plans.find((p) => p.plan.exercise.id === lastSet?.exerciseId)?.plan;
  const restTarget = lastPlan ? restOf(lastPlan) : 120;
  const isDone = (plan: ExercisePlan) => sessionSets.filter((x) => x.exerciseId === plan.exercise.id && !x.warmup).length >= plan.suggestion.sets;
  const doneCount = plans.filter((p) => isDone(p.plan)).length;

  async function changeRest(slot: Slot, plan: ExercisePlan, delta: number) {
    if (!open?.id) return;
    const next = clampRest(restOf(plan) + delta);
    await setSessionRest(open.id, slot.id, next);
    // 루틴 종목이면 루틴에도 저장 → 다음에도 이 휴식
    if (program?.id && day && slot.plannedId) await db.programs.update(program.id, { days: setDayRest(program, day.id, slot.plannedId, next).days });
  }

  async function saveOrder(ids: string[]) {
    if (!open?.id) return;
    setOrdering(false);
    await setSessionOrder(open.id, ids);
    // 루틴의 날 순서도 같이 바꿔 다음에도 이 순서로
    if (program?.id && day) {
      const pos = (pe: ProgramExercise) => {
        const i = ids.indexOf(open?.swaps?.[pe.exerciseId] ?? pe.exerciseId);
        return i < 0 ? ids.length : i;
      };
      const days = program.days.map((d) => (d.id === day.id ? { ...d, exercises: [...d.exercises].sort((a, b) => pos(a) - pos(b)) } : d));
      await db.programs.update(program.id, { days });
    }
  }

  async function finish() {
    if (!open?.id) return;
    await finishSession(open.id);
    go('today');
  }

  async function discard() {
    if (!open?.id) return;
    if (!window.confirm('이 세션과 기록된 세트를 모두 삭제할까요?')) return;
    await deleteSession(open.id);
  }

  async function addExercise(id: string) {
    if (!open?.id) return;
    setPicker(false);
    const shown = open.swaps?.[id] ?? id;
    if (plans.some((p) => p.slot.id === shown)) {
      setNotice(`${getExercise(shown)?.name ?? '이 종목'}은(는) 이미 목록에 있어요.`);
      document.getElementById(`ex-${shown}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!getExercise(id)) {
      setNotice('종목 정보를 찾지 못했어요. 다시 시도해 주세요.');
      return;
    }
    await addSessionExercise(open.id, id);
    setNotice(null);
    requestAnimationFrame(() => document.getElementById(`ex-${shown}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  async function removeExercise(slot: Slot, name: string) {
    if (!open?.id) return;
    const n = sessionSets.filter((s) => s.exerciseId === slot.id).length;
    if (!window.confirm(`"${name}"을(를) 이번 운동에서 삭제할까요?${n ? `
기록한 ${n}세트도 함께 지워집니다.` : ''}`)) return;
    const fromRoutine = !!(program?.id && day && slot.plannedId) && window.confirm(`루틴 "${day!.name}"에서도 빼서 다음부터 안 보이게 할까요?
(취소 = 이번 운동에서만 삭제)`);
    await removeSessionExercise(open.id, slot.id);
    if (fromRoutine && program?.id && day && slot.plannedId) {
      const days = program.days.map((d) => (d.id === day.id ? { ...d, exercises: d.exercises.filter((pe) => pe.exerciseId !== slot.plannedId) } : d));
      await db.programs.update(program.id, { days });
    }
    if (swapping?.id === slot.id) setSwapping(null);
  }

  async function doSwap(slot: Slot, to: string, alsoRoutine: boolean) {
    if (!open?.id) return;
    if (slot.plannedId) {
      await swapExercise(open.id, slot.plannedId, to);
      if (alsoRoutine && program?.id && day) {
        await db.programs.update(program.id, { days: replaceInProgram(program, day.id, slot.plannedId, to).days });
        await swapExercise(open.id, slot.plannedId, slot.plannedId); // 루틴 자체가 바뀌었으므로 세션 교체 내역은 불필요
      }
    } else {
      const s = await db.sessions.get(open.id);
      await db.sessions.update(open.id, { added: [...(s?.added ?? []).filter((x) => x !== slot.id && x !== to), to] });
    }
    setSwapping(null);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{day?.name ?? '자유 운동'}</h1>
        <div className="flex gap-2">
          {plans.length > 1 && (
            <Button variant="ghost" onClick={() => setOrdering((o) => !o)}>
              순서 변경
            </Button>
          )}
          <Button variant="danger" onClick={discard}>
            삭제
          </Button>
        </div>
      </header>

      {/* 맨 아래로 내려가도 운동 시간·진행률·휴식 타이머가 보이도록 상단 고정 */}
      <div role="region" aria-label="운동 진행" className="sticky top-0 z-20 -mx-4 space-y-2 border-b border-slate-800 bg-slate-950/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tabular-nums">{fmtDuration(Math.floor((now - open.startedAt) / 1000))}</span>
          <div className="flex-1">
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${plans.length ? (doneCount / plans.length) * 100 : 0}%` }} />
            </div>
            <p className="mt-0.5 flex justify-between text-xs tabular-nums">
              <span className="font-semibold text-emerald-300">
                {doneCount}/{plans.length} 종목 완료 · {plans.length ? Math.round((doneCount / plans.length) * 100) : 0}%
              </span>
              <span className="text-slate-400">{sessionSets.filter((s) => !s.warmup).length}세트</span>
            </p>
          </div>
        </div>
        {lastSet && <RestTimer startedAt={lastSet.completedAt} defaultTarget={restTarget} now={now} setKey={lastSet.id} />}
      </div>

      {ordering && <OrderEditor items={plans.map((p) => ({ id: p.slot.id, name: p.plan.exercise.name, done: isDone(p.plan) }))} onSave={saveOrder} onClose={() => setOrdering(false)} />}

      {plans.length === 0 && <Empty>아래에서 운동을 추가하세요.</Empty>}

      {plans.map(({ slot, plan }) => (
        <div key={slot.id} id={`ex-${slot.id}`} className="scroll-mt-28 space-y-2">
          <ExerciseLogCard
            plan={plan}
            sessionId={open.id!}
            done={sessionSets.filter((s) => s.exerciseId === plan.exercise.id)}
            lastTime={exerciseHistory(ctx.sets, plan.exercise.id).at(-1)?.sets}
            swappedFrom={slot.plannedId && slot.plannedId !== slot.id ? getExercise(slot.plannedId)?.name : undefined}
            onSwap={() => setSwapping(swapping?.id === slot.id ? null : slot)}
            onRemove={() => removeExercise(slot, plan.exercise.name)}
            restSec={restOf(plan)}
            onRest={(d) => changeRest(slot, plan, d)}
          />
          {swapping?.id === slot.id && <SwapPicker slot={slot} canApplyToRoutine={!!slot.plannedId && !!day} onPick={(to, routine) => doSwap(slot, to, routine)} onClose={() => setSwapping(null)} />}
        </div>
      ))}

      {notice && (
        <p role="status" className="rounded-xl border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          {notice}
        </p>
      )}

      {picker ? (
        <ExercisePicker onPick={addExercise} onClose={() => setPicker(false)} />
      ) : (
        <Button variant="ghost" className="w-full" onClick={() => (setNotice(null), setPicker(true))}>
          + 운동 추가
        </Button>
      )}

      <Button className="w-full py-3 text-base" onClick={finish}>
        운동 종료
      </Button>
    </div>
  );
}

// ─────────────────────────────── RIR 선택

/** null = 모름 (기본값으로 채우고 "추정"으로 표시) */
function RirChoice({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const opts: { v: number | null; label: string }[] = [
    { v: 0, label: '0' },
    { v: 1, label: '1' },
    { v: 2, label: '2' },
    { v: 3, label: '3' },
    { v: 4, label: '4+' },
    { v: null, label: '모름' },
  ];
  return (
    <div>
      <span className="text-xs text-slate-400">몇 개 더 할 수 있었나요? (RIR · 0 = 더는 못 함)</span>
      <div className="mt-1 grid grid-cols-6 gap-1">
        {opts.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
            className={`h-10 rounded-lg text-sm font-semibold ${value === o.v ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────── 종목 카드

function ExerciseLogCard({
  plan,
  sessionId,
  done,
  lastTime,
  swappedFrom,
  onSwap,
  onRemove,
  restSec,
  onRest,
}: {
  plan: ExercisePlan;
  sessionId: number;
  done: SetLog[];
  lastTime?: SetLog[];
  swappedFrom?: string;
  onSwap: () => void;
  onRemove: () => void;
  restSec: number;
  onRest: (delta: number) => void;
}) {
  const s = plan.suggestion;
  const inc = plan.exercise.increment || 1;
  const initWeight = done.at(-1)?.weight ?? s.weight ?? lastTime?.at(-1)?.weight ?? 20;
  const initReps = done.at(-1)?.reps ?? s.repsTarget;
  const [weight, setWeightRaw] = useState(initWeight);
  const [reps, setRepsRaw] = useState(initReps);
  const [rir, setRir] = useState<number | null>(null);
  const [warmup, setWarmup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const working = done.filter((d) => !d.warmup);
  const complete = working.length >= s.sets;
  const [more, setMore] = useState(false);
  const showInputs = !complete || more;

  // DB 로드가 끝나 처방이 바뀌면, 사용자가 직접 수정하기 전까지는 입력값을 처방에 맞춘다
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setWeightRaw(initWeight);
    setRepsRaw(initReps);
  }, [initWeight, initReps]);
  const setWeight = (v: number) => ((touched.current = true), setWeightRaw(v));
  const setReps = (v: number) => ((touched.current = true), setRepsRaw(v));

  async function add() {
    unlockAudio();
    setBusy(true);
    try {
      await logSet({ sessionId, exerciseId: plan.exercise.id, weight, reps, rir: rir ?? DEFAULT_UNKNOWN_RIR, rirEstimated: rir === null, warmup });
      setWarmup(false);
      setMore(false);
    } finally {
      setBusy(false);
    }
  }

  let workNo = 0;
  return (
    <Card
      title={plan.exercise.name}
      className={complete ? 'border-2 border-emerald-500! bg-emerald-950/50!' : ''}
      right={
        <span className="flex items-center gap-1">
          {complete ? (
            <span className="rounded-full bg-emerald-500 px-3 py-1 text-sm font-bold whitespace-nowrap text-slate-950">✓ 완료</span>
          ) : (
            <Badge tone="slate">
              {working.length}/{s.sets}세트
            </Badge>
          )}
          <button type="button" onClick={onSwap} className="h-8 rounded-lg border border-slate-700 px-2 text-xs text-slate-200">
            교체
          </button>
          <button type="button" onClick={onRemove} aria-label={`${plan.exercise.name} 삭제`} className="h-8 rounded-lg border border-slate-700 px-2 text-xs text-rose-300">
            삭제
          </button>
        </span>
      }
    >
      <div className="mb-2 flex gap-1" aria-label="세트 진행">
        {Array.from({ length: Math.max(s.sets, working.length) }, (_, i) => (
          <span key={i} className={`h-2 flex-1 rounded-full ${i < working.length ? 'bg-emerald-400' : 'bg-slate-700'}`} />
        ))}
      </div>
      {swappedFrom && <p className="mb-1 text-xs text-sky-300">↺ {swappedFrom} 대신</p>}
      <p className="text-sm text-slate-300 tabular-nums">
        <Badge tone="sky">{ACTION_LABEL[s.action]}</Badge> 목표 {s.weight === null ? '무게 찾기' : `${s.weight}kg`} × {s.repsTarget}회 · RIR {s.rir} · 범위 {plan.repMin}~{plan.repMax}회
      </p>
      {lastTime && <p className="mt-1 text-xs text-slate-500 tabular-nums">지난번: {lastTime.map((x) => `${x.weight}×${x.reps}`).join(', ')}</p>}
      <WhyCard reasons={plan.reasons} />

      {done.length > 0 && (
        <ol className="mt-3 space-y-1">
          {done.map((d) => {
            const label = d.warmup ? 'W' : String(++workNo);
            return editing === d.id ? (
              <SetEditor key={d.id} set={d} inc={inc} onDone={() => setEditing(null)} />
            ) : (
              <li key={d.id} className="flex items-center gap-1 rounded-lg bg-slate-950/60 px-3 py-1.5 text-sm tabular-nums">
                <span className="w-6 text-slate-500">{label}</span>
                <span className="flex-1">
                  {d.weight}kg × {d.reps} <span className="text-slate-400">{d.rirEstimated ? 'RIR 추정' : `RIR ${d.rir}`}</span>
                </span>
                {d.restSec !== undefined && <span className="mr-1 text-xs text-slate-500">휴식 {fmtDuration(d.restSec)}</span>}
                <button type="button" aria-label={`${label}세트 수정`} className="px-1.5 text-xs text-slate-400 hover:text-emerald-300" onClick={() => setEditing(d.id ?? null)}>
                  수정
                </button>
                <button type="button" aria-label={`${label}세트 삭제`} className="px-1.5 text-slate-500 hover:text-rose-400" onClick={() => d.id && db.sets.delete(d.id)}>
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-slate-400">세트 사이</span>
        <button type="button" aria-label="휴식 줄이기" onClick={() => onRest(-15)} className="h-8 w-10 rounded-lg bg-slate-800">
          −15
        </button>
        <span className="min-w-20 text-center font-semibold tabular-nums">휴식 {fmtDuration(restSec)}</span>
        <button type="button" aria-label="휴식 늘리기" onClick={() => onRest(15)} className="h-8 w-10 rounded-lg bg-slate-800">
          +15
        </button>
      </div>

      {!showInputs && (
        <Button variant="ghost" className="mt-3 w-full" onClick={() => setMore(true)}>
          한 세트 더
        </Button>
      )}
      {showInputs && (
        <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stepper label="무게" suffix="kg" value={weight} onChange={setWeight} step={inc} />
        <Stepper label="반복" suffix="회" value={reps} onChange={setReps} step={1} />
      </div>
      <div className="mt-2">
        <RirChoice value={rir} onChange={setRir} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-slate-400">
          <input type="checkbox" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
          워밍업
        </label>
        <Button className="flex-1 py-3" onClick={add} disabled={busy || reps <= 0}>
          세트 완료 ✓
        </Button>
      </div>
        </>
      )}
    </Card>
  );
}

function SetEditor({ set, inc, onDone }: { set: SetLog; inc: number; onDone: () => void }) {
  const [weight, setWeight] = useState(set.weight);
  const [reps, setReps] = useState(set.reps);
  const [rir, setRir] = useState<number | null>(set.rirEstimated ? null : set.rir);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    try {
      await updateSet(set.id!, { weight, reps, rir });
      onDone();
    } catch (e) {
      setErr(e instanceof ManualRecordError ? e.message : '수정에 실패했습니다.');
    }
  }

  return (
    <li className="space-y-2 rounded-lg border border-emerald-800 bg-slate-950/80 p-2">
      <div className="grid grid-cols-2 gap-2">
        <Stepper label="수정 무게" suffix="kg" value={weight} onChange={setWeight} step={inc} />
        <Stepper label="수정 반복" suffix="회" value={reps} onChange={setReps} step={1} />
      </div>
      <RirChoice value={rir} onChange={setRir} />
      {err && (
        <p role="alert" className="text-sm text-rose-300">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onDone}>
          취소
        </Button>
        <Button className="flex-1" onClick={save}>
          수정 저장
        </Button>
      </div>
    </li>
  );
}

// ─────────────────────────────── 종목 교체

function SwapPicker({
  slot,
  canApplyToRoutine,
  onPick,
  onClose,
}: {
  slot: Slot;
  canApplyToRoutine: boolean;
  onPick: (to: string, alsoRoutine: boolean) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const base = slot.plannedId ?? slot.id;
  const alts = alternativesFor(slot.id, 8);
  const list = q.trim() ? allExercises().filter((e) => e.id !== slot.id && e.name.includes(q.trim())) : alts;

  return (
    <Card title="종목 교체" right={<Button variant="subtle" onClick={onClose}>닫기</Button>} className="border-sky-800">
      {chosen ? (
        <div className="space-y-2">
          <p className="text-sm">
            <b>{getExercise(chosen)?.name}</b>(으)로 바꿉니다.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => onPick(chosen, false)}>
              이번만
            </Button>
            {canApplyToRoutine && (
              <Button className="flex-1" onClick={() => onPick(chosen, true)}>
                루틴에도 반영
              </Button>
            )}
          </div>
          {!canApplyToRoutine && (
            <Button variant="ghost" className="w-full" onClick={() => onPick(chosen, false)}>
              바꾸기
            </Button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-400">같은 부위를 자극하는 종목입니다. 처음 하는 종목은 "무게 찾기"부터 시작합니다.</p>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="다른 종목 검색"
            className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base outline-none focus:border-emerald-500"
          />
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {base !== slot.id && (
              <li>
                <button type="button" onClick={() => setChosen(base)} className="w-full rounded-lg px-3 py-2 text-left text-sky-300 hover:bg-slate-800">
                  ↺ 원래 종목으로: {getExercise(base)?.name}
                </button>
              </li>
            )}
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setChosen(e.id)} className="flex w-full justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-800">
                  <span>{e.name}</span>
                  <span className="text-xs text-slate-500">{e.compound ? '복합' : '고립'}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// ─────────────────────────────── 운동 추가

function ExercisePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState<Muscle>('chest');
  const [compound, setCompound] = useState(false);
  const query = q.trim();
  const list = allExercises().filter((e) => e.name.replace(/\s/g, '').includes(query.replace(/\s/g, '')));
  const exact = list.some((e) => e.name === query);

  async function create(n = name, m = muscle, c = compound) {
    if (!n.trim()) return;
    onPick(await createCustomExercise({ name: n, muscle: m, compound: c }));
  }

  return (
    <Card title="운동 추가" right={<Button variant="subtle" onClick={onClose}>닫기</Button>}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="운동 이름 검색"
        className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base outline-none focus:border-emerald-500"
      />
      {query && !exact && (
        <div className="mb-2 space-y-2 rounded-xl border border-emerald-700 p-2">
          <select aria-label="주로 쓰는 부위" value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base">
            {MUSCLES.map((m) => (
              <option key={m} value={m}>
                주로 쓰는 부위: {MUSCLE_LABEL[m]}
              </option>
            ))}
          </select>
          <Button className="w-full" onClick={() => create(query, muscle, compound)}>
            "{query}" 새 종목으로 추가
          </Button>
        </div>
      )}
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e.id)} className="flex w-full justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-800">
              <span>{e.name}</span>
              <span className="text-xs text-slate-500">
                {(Object.entries(e.muscles) as [Muscle, number][])
                  .filter(([, c]) => c >= 1)
                  .map(([m]) => MUSCLE_LABEL[m])
                  .join('·')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {creating ? (
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="새 운동 이름" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base outline-none" />
          <select value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base">
            {MUSCLES.map((m) => (
              <option key={m} value={m}>
                주동근: {MUSCLE_LABEL[m]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={compound} onChange={(e) => setCompound(e.target.checked)} className="accent-emerald-500" />
            다관절(복합) 운동
          </label>
          <Button className="w-full" onClick={() => create()} disabled={!name.trim()}>
            만들고 추가
          </Button>
        </div>
      ) : (
        <Button variant="subtle" className="mt-3 w-full" onClick={() => setCreating(true)}>
          목록에 없는 운동 만들기
        </Button>
      )}
    </Card>
  );
}

// ─────────────────────────────── 순서 변경 (전체 목록에서 한 번에)

function OrderEditor({ items, onSave, onClose }: { items: { id: string; name: string; done: boolean }[]; onSave: (ids: string[]) => void; onClose: () => void }) {
  const [ids, setIds] = useState(items.map((i) => i.id));
  const byId = (id: string) => items.find((i) => i.id === id)!;
  return (
    <Card title="운동 순서" right={<Button variant="subtle" onClick={onClose}>닫기</Button>} className="border-emerald-700">
      <p className="mb-2 text-xs text-slate-400">종목을 꾹 잡고 원하는 위치로 끌어다 놓으세요. "순서 저장"하면 루틴의 순서도 같이 바뀝니다.</p>
      <DragList
        label="운동 순서"
        items={ids}
        keyOf={(id) => id}
        onMove={(from, to) => setIds((x) => moveIndex(x, from, to))}
        render={(id, i, handle, dragging) => {
          const it = byId(id);
          return (
            <div {...handle} aria-label={`${it.name} 끌어서 이동`} className={`flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 ${dragging ? 'bg-slate-700' : 'bg-slate-950/60'}`}>
              <span className="w-6 text-center font-bold text-slate-400 tabular-nums">{i + 1}</span>
              <span className={`flex-1 ${it.done ? 'text-emerald-300' : ''}`}>
                {it.name}
                {it.done ? ' ✓' : ''}
              </span>
              <span aria-hidden className="text-xl text-slate-500">≡</span>
            </div>
          );
        }}
      />
      <Button className="mt-3 w-full py-3" onClick={() => onSave(ids)}>
        순서 저장
      </Button>
    </Card>
  );
}
