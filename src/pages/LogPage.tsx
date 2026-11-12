import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tab } from '../App';
import { Badge, Button, Card, Empty, Stepper, WhyCard, fmtDuration } from '../components/ui';
import { db, deleteSession, finishSession, loadCustomExercises, logSet, startSession } from '../data/db';
import { useActiveProgram, useAllSets, useCheckins, useNow, useOpenSession, useSessions } from '../data/hooks';
import { allExercises } from '../domain/exercises';
import { MUSCLES, MUSCLE_LABEL, type Muscle, type SetLog } from '../domain/types';
import { buildContext, planExercise, type ExercisePlan } from '../engine/planner';
import { ACTION_LABEL, exerciseHistory } from '../engine/progression';
import { nextProgramDay } from '../engine/splits';

export function LogPage({ go }: { go: (t: Tab) => void }) {
  const open = useOpenSession();
  const program = useActiveProgram();
  const sessions = useSessions();
  const allSets = useAllSets();
  const checkins = useCheckins();
  const now = useNow(1000);
  const [extra, setExtra] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);

  // 1분 단위(또는 데이터 변경 시)로만 컨텍스트 재계산 — 타이머 매초 갱신과 분리.
  // now 를 분 단위로 내림하면 방금 끝낸 세트가 "미래"로 취급되므로 실제 현재 시각을 사용한다.
  const minute = Math.floor(now / 60_000);
  const ctx = useMemo(
    () => buildContext({ now: Date.now(), sets: allSets, checkins, program: program ?? undefined, excludeSessionId: open?.id }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- minute 는 주기적 재계산 트리거
    [minute, allSets, checkins, program, open?.id],
  );

  const sessionSets = useMemo(() => (open?.id ? allSets.filter((s) => s.sessionId === open.id) : []), [allSets, open?.id]);
  const day = program && open && open.programId === program.id ? program.days.find((d) => d.id === open.dayId) : undefined;

  const exerciseIds = useMemo(() => {
    const ids = [...(day?.exercises.map((e) => e.exerciseId) ?? []), ...sessionSets.map((s) => s.exerciseId), ...extra];
    return [...new Set(ids)];
  }, [day, sessionSets, extra]);

  const plans = useMemo(
    () =>
      exerciseIds
        .map((id) => planExercise(ctx, id, day?.exercises.find((e) => e.exerciseId === id)))
        .filter((p): p is ExercisePlan => p !== null),
    [exerciseIds, ctx, day],
  );

  // 휴식 타이머
  const lastSet = sessionSets.at(-1);
  const restTarget = plans.find((p) => p.exercise.id === lastSet?.exerciseId)?.restSec ?? 120;
  const restElapsed = lastSet ? (now - lastSet.completedAt) / 1000 : null;
  const buzzedFor = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (restElapsed !== null && lastSet?.id !== undefined && restElapsed >= restTarget && buzzedFor.current !== lastSet.id) {
      buzzedFor.current = lastSet.id;
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        /* 진동 미지원 기기 */
      }
    }
  }, [restElapsed, restTarget, lastSet?.id]);

  if (open === undefined) return null;

  if (open === null) {
    const nextDay = program ? nextProgramDay(program, sessions) : undefined;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">운동 기록</h1>
        <Card>
          <div className="space-y-2">
            {program?.id && nextDay && (
              <Button className="w-full py-3 text-base" onClick={() => startSession({ programId: program.id, dayId: nextDay.id })}>
                루틴 시작: {nextDay.name}
              </Button>
            )}
            {program?.days
              .filter((d) => d.id !== nextDay?.id)
              .map((d) => (
                <Button key={d.id} variant="ghost" className="w-full" onClick={() => startSession({ programId: program.id, dayId: d.id })}>
                  {d.name}
                </Button>
              ))}
            <Button variant="subtle" className="w-full" onClick={() => startSession()}>
              자유 운동 시작
            </Button>
          </div>
        </Card>
        <RecentSessionsHint sessions={sessions.filter((s) => s.endedAt).slice(0, 3)} sets={allSets} />
      </div>
    );
  }

  const elapsedMin = Math.floor((now - open.startedAt) / 60_000);

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

      {restElapsed !== null && (
        <div
          className={`sticky top-2 z-10 flex items-center justify-between rounded-2xl border px-4 py-3 backdrop-blur ${
            restElapsed >= restTarget ? 'border-emerald-600 bg-emerald-950/90' : 'border-slate-700 bg-slate-900/90'
          }`}
          role="timer"
          aria-live="off"
        >
          <span className="text-sm text-slate-300">휴식</span>
          <span className="text-3xl font-bold tabular-nums">{fmtDuration(restElapsed)}</span>
          <span className="text-sm text-slate-400">목표 {fmtDuration(restTarget)}</span>
        </div>
      )}

      {plans.length === 0 && <Empty>아래에서 운동을 추가하세요.</Empty>}

      {plans.map((p) => (
        <ExerciseLogCard
          key={p.exercise.id}
          plan={p}
          sessionId={open.id!}
          done={sessionSets.filter((s) => s.exerciseId === p.exercise.id)}
          lastTime={exerciseHistory(ctx.sets, p.exercise.id).at(-1)?.sets}
        />
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

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];

function ExerciseLogCard({ plan, sessionId, done, lastTime }: { plan: ExercisePlan; sessionId: number; done: SetLog[]; lastTime?: SetLog[] }) {
  const s = plan.suggestion;
  const inc = plan.exercise.increment || 1;
  const initWeight = done.at(-1)?.weight ?? s.weight ?? lastTime?.at(-1)?.weight ?? 20;
  const initReps = done.at(-1)?.reps ?? s.repsTarget;
  const initRir = done.at(-1)?.rir ?? s.rir;
  const [weight, setWeightRaw] = useState(initWeight);
  const [reps, setRepsRaw] = useState(initReps);
  const [rir, setRirRaw] = useState(initRir);
  const [warmup, setWarmup] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = done.filter((d) => !d.warmup);

  // DB 로드가 끝나 처방이 바뀌면, 사용자가 직접 수정하기 전까지는 입력값을 처방에 맞춘다
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setWeightRaw(initWeight);
    setRepsRaw(initReps);
    setRirRaw(initRir);
  }, [initWeight, initReps, initRir]);
  const setWeight = (v: number) => ((touched.current = true), setWeightRaw(v));
  const setReps = (v: number) => ((touched.current = true), setRepsRaw(v));
  const setRir = (v: number) => ((touched.current = true), setRirRaw(v));

  async function add() {
    setBusy(true);
    try {
      await logSet({ sessionId, exerciseId: plan.exercise.id, weight, reps, rir, warmup });
      setWarmup(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={plan.exercise.name}
      right={
        <span className="flex items-center gap-1">
          <Badge tone={working.length >= s.sets ? 'emerald' : 'slate'}>
            {working.length}/{s.sets}세트
          </Badge>
        </span>
      }
    >
      <p className="text-sm text-slate-300 tabular-nums">
        <Badge tone="sky">{ACTION_LABEL[s.action]}</Badge>{' '}
        목표 {s.weight === null ? '무게 찾기' : `${s.weight}kg`} × {s.repsTarget}회 · RIR {s.rir} · 범위 {plan.repMin}~{plan.repMax}회
      </p>
      {lastTime && (
        <p className="mt-1 text-xs text-slate-500 tabular-nums">
          지난번: {lastTime.map((x) => `${x.weight}×${x.reps}`).join(', ')}
        </p>
      )}
      <WhyCard reasons={plan.reasons} />

      {done.length > 0 && (
        <ol className="mt-3 space-y-1">
          {done.map((d, i) => (
            <li key={d.id} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-1.5 text-sm tabular-nums">
              <span className="w-6 text-slate-500">{d.warmup ? 'W' : i + 1 - done.slice(0, i).filter((x) => x.warmup).length}</span>
              <span className="flex-1">
                {d.weight}kg × {d.reps} <span className="text-slate-400">RIR {d.rir}</span>
              </span>
              {d.restSec !== undefined && <span className="mr-2 text-xs text-slate-500">휴식 {fmtDuration(d.restSec)}</span>}
              <button type="button" aria-label="세트 삭제" className="px-2 text-slate-500 hover:text-rose-400" onClick={() => d.id && db.sets.delete(d.id)}>
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stepper label="무게" suffix="kg" value={weight} onChange={setWeight} step={inc} />
        <Stepper label="반복" suffix="회" value={reps} onChange={setReps} step={1} />
      </div>
      <div className="mt-2">
        <span className="text-xs text-slate-400">RIR (실패까지 남은 횟수)</span>
        <div className="mt-1 grid grid-cols-6 gap-1">
          {RIR_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRir(r)}
              className={`h-9 rounded-lg text-sm font-semibold ${rir === r ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
            >
              {r === 0 ? '0 실패' : r === 5 ? '5+' : r}
            </button>
          ))}
        </div>
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
        className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-emerald-500"
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 운동 이름"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none"
          />
          <select value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5">
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

function RecentSessionsHint({ sessions, sets }: { sessions: { id?: number; startedAt: number }[]; sets: SetLog[] }) {
  if (sessions.length === 0) return null;
  return (
    <Card title="최근 운동">
      <ul className="space-y-1 text-sm text-slate-300">
        {sessions.map((s) => {
          const n = sets.filter((x) => x.sessionId === s.id && !x.warmup).length;
          return (
            <li key={s.id} className="flex justify-between">
              <span>{new Date(s.startedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}</span>
              <span className="text-slate-400">{n}세트</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
