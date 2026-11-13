import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tab } from '../App';
import { ManualEntryForm, ManualEntryList } from '../components/ManualEntry';
import { PasteImport } from '../components/PasteImport';
import { TransferCard } from '../components/TransferCard';
import { RestTimer } from '../components/RestTimer';
import { Badge, Button, Card, Empty, Stepper, WhyCard, fmtDuration } from '../components/ui';
import { db, deleteSession, finishSession, loadCustomExercises, logSet, startSession, swapExercise, updateSet } from '../data/db';
import { useActiveProgram, useAllSets, useCheckins, useNow, useOpenSession, useSessions } from '../data/hooks';
import { allExercises, getExercise } from '../domain/exercises';
import { MUSCLES, MUSCLE_LABEL, type Muscle, type ProgramExercise, type SetLog } from '../domain/types';
import { buildContext, planExercise, type ExercisePlan } from '../engine/planner';
import { ACTION_LABEL, exerciseHistory, recommendedRest } from '../engine/progression';
import { DEFAULT_UNKNOWN_RIR, ManualRecordError } from '../engine/records';
import { scheduledDayFor } from '../engine/schedule';
import { defaultRepRange, nextProgramDay } from '../engine/splits';
import { alternativesFor, replaceInProgram } from '../engine/swap';
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
  const [extra, setExtra] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [swapping, setSwapping] = useState<Slot | null>(null);

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
    const out: Slot[] = [];
    for (const pe of day?.exercises ?? []) {
      const to = swaps[pe.exerciseId];
      const ex = to ? getExercise(to) : undefined;
      if (to && ex) {
        const [repMin, repMax] = defaultRepRange(ex);
        out.push({ id: to, plannedId: pe.exerciseId, pe: { ...pe, exerciseId: to, repMin, repMax, restSec: recommendedRest(ex) } });
      } else out.push({ id: pe.exerciseId, plannedId: pe.exerciseId, pe });
    }
    for (const id of [...sessionSets.map((s) => s.exerciseId), ...extra.map((x) => swaps[x] ?? x)]) {
      if (!out.some((s) => s.id === id)) out.push({ id });
    }
    return out;
  }, [day, sessionSets, extra, open?.swaps]);

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

  const elapsedMin = Math.floor((now - open.startedAt) / 60_000);
  const lastSet = sessionSets.at(-1);
  const restTarget = plans.find((p) => p.plan.exercise.id === lastSet?.exerciseId)?.plan.restSec ?? 120;

  async function finish() {
    if (!open?.id) return;
    await finishSession(open.id);
    setExtra([]);
    go('today');
  }

  async function discard() {
    if (!open?.id) return;
    if (!window.confirm('이 세션과 기록된 세트를 모두 삭제할까요?')) return;
    await deleteSession(open.id);
    setExtra([]);
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
      setExtra((e) => [...e.filter((x) => x !== slot.id), to]);
    }
    setSwapping(null);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">{day?.name ?? '자유 운동'}</h1>
          <p className="text-sm text-slate-400">
            {elapsedMin}분 경과 · {sessionSets.filter((s) => !s.warmup).length}세트 완료
          </p>
        </div>
        <Button variant="danger" onClick={discard}>
          삭제
        </Button>
      </header>

      {lastSet && <RestTimer startedAt={lastSet.completedAt} defaultTarget={restTarget} now={now} setKey={lastSet.id} />}

      {plans.length === 0 && <Empty>아래에서 운동을 추가하세요.</Empty>}

      {plans.map(({ slot, plan }) => (
        <div key={slot.id} className="space-y-2">
          <ExerciseLogCard
            plan={plan}
            sessionId={open.id!}
            done={sessionSets.filter((s) => s.exerciseId === plan.exercise.id)}
            lastTime={exerciseHistory(ctx.sets, plan.exercise.id).at(-1)?.sets}
            swappedFrom={slot.plannedId && slot.plannedId !== slot.id ? getExercise(slot.plannedId)?.name : undefined}
            onSwap={() => setSwapping(swapping?.id === slot.id ? null : slot)}
          />
          {swapping?.id === slot.id && <SwapPicker slot={slot} canApplyToRoutine={!!slot.plannedId && !!day} onPick={(to, routine) => doSwap(slot, to, routine)} onClose={() => setSwapping(null)} />}
        </div>
      ))}

      {picker ? (
        <ExercisePicker
          onPick={(id) => {
            setExtra((e) => [...e, id]);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      ) : (
        <Button variant="ghost" className="w-full" onClick={() => setPicker(true)}>
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
}: {
  plan: ExercisePlan;
  sessionId: number;
  done: SetLog[];
  lastTime?: SetLog[];
  swappedFrom?: string;
  onSwap: () => void;
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
    } finally {
      setBusy(false);
    }
  }

  let workNo = 0;
  return (
    <Card
      title={plan.exercise.name}
      right={
        <span className="flex items-center gap-1.5">
          <Badge tone={working.length >= s.sets ? 'emerald' : 'slate'}>
            {working.length}/{s.sets}세트
          </Badge>
          <button type="button" onClick={onSwap} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200">
            교체
          </button>
        </span>
      }
    >
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
  const list = allExercises().filter((e) => e.name.includes(q.trim()));

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = `custom_${Date.now()}`;
    await db.customExercises.add({ id, name: trimmed, equipment: 'machine', compound, muscles: { [muscle]: 1 }, increment: 2.5, custom: true });
    await loadCustomExercises();
    onPick(id);
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
          <Button className="w-full" onClick={create} disabled={!name.trim()}>
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
