import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { addManualEntry, db, deleteExerciseSets, deleteSession } from '../data/db';
import { allExercises, getExercise } from '../domain/exercises';
import type { SetLog, WorkoutSession } from '../domain/types';
import { ManualRecordError } from '../engine/records';
import { Button, Card, fmtDate } from './ui';

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseLocalDate(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return Number.NaN;
  return new Date(y, m - 1, d).getTime();
}

type Row = { weight: number; reps: number; rir: number | null };

const inputCls = 'h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-2 text-center text-base tabular-nums outline-none focus:border-emerald-500';

/** 다른 앱 기록을 손으로 옮겨 적는 폼: 날짜 · 종목 · 세트별 무게/반복(RIR 선택) */
export function ManualEntryForm() {
  const exercises = useMemo(() => [...allExercises()].sort((a, b) => a.name.localeCompare(b.name, 'ko')), []);
  const [date, setDate] = useState(todayStr);
  const [exerciseId, setExerciseId] = useState('bench_press');
  const [rows, setRows] = useState<Row[]>([{ weight: 20, reps: 10, rir: null }]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => (rs.length >= 20 ? rs : [...rs, { ...rs.at(-1)! }]));

  // PC 빠른 입력: Enter → 다음 세트 칸(없으면 추가, 값 복사), Ctrl/⌘+Enter → 저장
  const wrapRef = useRef<HTMLDivElement>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  useEffect(() => {
    if (focusRow === null) return;
    const el = wrapRef.current?.querySelector<HTMLInputElement>(`[aria-label="${focusRow + 1}세트 무게"]`);
    el?.focus();
    el?.select();
    setFocusRow(null);
  }, [focusRow, rows.length]);
  const onKey = (i: number, e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      void save();
      return;
    }
    if (i === rows.length - 1) addRow();
    setFocusRow(i + 1);
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await addManualEntry({ date: parseLocalDate(date), exerciseId, sets: rows });
      setMsg({ ok: true, text: `${getExercise(exerciseId)?.name} ${rows.length}세트 저장됨` });
      setRows((rs) => [rs.at(-1)!]);
    } catch (err) {
      if (err instanceof ManualRecordError) setMsg({ ok: false, text: err.message });
      else {
        console.error('직접 입력 저장 실패', err);
        setMsg({ ok: false, text: '저장에 실패했습니다.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="지난 기록 직접 입력">
      <div ref={wrapRef}>
      <p className="mb-3 text-sm text-slate-400">다른 앱에 있던 기록을 날짜별로 옮겨 적으세요. RIR(실패까지 남은 횟수)은 모르면 "모름"으로 두면 됩니다.</p>
      {/* iOS Safari 의 날짜 칸은 내부 최소 폭 때문에 좁은 칸에서 옆 칸을 덮는다 → 한 줄씩 전체 너비 */}
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          날짜
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className={`${inputCls} text-left`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          운동
          <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} className={`${inputCls} text-left`}>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center gap-1.5 text-xs text-slate-500">
        <span />
        <span className="text-center">무게(kg)</span>
        <span className="text-center">반복</span>
        <span className="text-center">RIR</span>
        <span />
        {rows.map((r, i) => (
          <Row
            key={i}
            i={i}
            row={r}
            onChange={(p) => setRow(i, p)}
            onKeyDown={(e) => onKey(i, e)}
            onRemove={rows.length > 1 ? () => setRows((rs) => rs.filter((_, j) => j !== i)) : undefined}
          />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="subtle" className="flex-1" onClick={addRow}>
          세트 추가
        </Button>
        <Button className="flex-1" onClick={save} disabled={busy}>
          기록 저장
        </Button>
      </div>
      {msg &&
        (msg.ok ? (
          <p role="status" className="mt-2 text-sm text-emerald-300">
            ✓ {msg.text}
          </p>
        ) : (
          <p role="alert" className="mt-2 text-sm text-rose-300">
            {msg.text}
          </p>
        ))}
      <p className="mt-2 hidden text-xs text-slate-500 sm:block">⌨ Enter: 다음 세트 · Ctrl+Enter: 저장</p>
      </div>
    </Card>
  );
}

function Row({
  i,
  row,
  onChange,
  onKeyDown,
  onRemove,
}: {
  i: number;
  row: Row;
  onChange: (p: Partial<Row>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onRemove?: () => void;
}) {
  const n = i + 1;
  return (
    <>
      <span className="text-center text-sm text-slate-400">{n}</span>
      <input aria-label={`${n}세트 무게`} type="number" inputMode="decimal" value={row.weight} onChange={(e) => onChange({ weight: Number(e.target.value) })} onKeyDown={onKeyDown} onFocus={(e) => e.currentTarget.select()} className={inputCls} />
      <input aria-label={`${n}세트 반복`} type="number" inputMode="numeric" value={row.reps} onChange={(e) => onChange({ reps: Number(e.target.value) })} onKeyDown={onKeyDown} onFocus={(e) => e.currentTarget.select()} className={inputCls} />
      <select
        aria-label={`${n}세트 RIR`}
        value={row.rir === null ? '' : String(row.rir)}
        onChange={(e) => onChange({ rir: e.target.value === '' ? null : Number(e.target.value) })}
        onKeyDown={onKeyDown}
        className={inputCls}
      >
        <option value="">모름</option>
        {[0, 1, 2, 3, 4, 5].map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      {onRemove ? (
        <button type="button" aria-label={`${n}세트 삭제`} className="h-11 text-slate-500 hover:text-rose-400" onClick={onRemove}>
          ✕
        </button>
      ) : (
        <span />
      )}
    </>
  );
}

/** 기록 탭 맨 아래의 지난 기록 목록으로 스크롤 (불러오는 중이면 잠깐 기다림) */
export function scrollToPastRecords(tries = 20) {
  const el = document.getElementById('past-records');
  if (el) el.scrollIntoView({ block: 'start' });
  else if (tries > 0) setTimeout(() => scrollToPastRecords(tries - 1), 100);
}

/** 기록 탭 위쪽: 저장된 지난 기록이 있으면 바로 내려가는 버튼 */
export function PastRecordsShortcut() {
  const days = useLiveQuery(() => db.sessions.filter((s) => s.manual === true).count(), []);
  if (!days) return null;
  return (
    <Button variant="ghost" className="w-full" onClick={() => scrollToPastRecords()}>
      저장된 지난 기록 {days}일 보기 ↓
    </Button>
  );
}

/** 직접 입력·가져온 루틴으로 저장한 지난 기록 목록 (날짜별 · 종목별), 삭제 가능 */
export function ManualEntryList() {
  const data = useLiveQuery(async () => {
    const sessions = await db.sessions.filter((s) => s.manual === true).toArray();
    sessions.sort((a, b) => b.startedAt - a.startedAt);
    const top = sessions.slice(0, 30);
    const sets = await db.sets.where('sessionId').anyOf(top.map((s) => s.id!)).toArray();
    return { sessions: top, sets };
  }, []);

  if (!data || data.sessions.length === 0) return null;
  return (
    <div id="past-records" className="scroll-mt-4">
    <Card title="저장된 지난 기록">
      <ul className="space-y-3">
        {data.sessions.map((s) => (
          <ManualDay key={s.id} session={s} sets={data.sets.filter((x) => x.sessionId === s.id)} />
        ))}
      </ul>
    </Card>
    </div>
  );
}

function ManualDay({ session, sets }: { session: WorkoutSession; sets: SetLog[] }) {
  const byEx = new Map<string, SetLog[]>();
  for (const s of [...sets].sort((a, b) => a.order - b.order)) {
    if (!byEx.has(s.exerciseId)) byEx.set(s.exerciseId, []);
    byEx.get(s.exerciseId)!.push(s);
  }
  return (
    <li>
      <p className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-400">
        {fmtDate(session.startedAt)}
        <button
          type="button"
          aria-label={`${fmtDate(session.startedAt)} 기록 전체 삭제`}
          className="rounded border border-rose-900 px-2 py-0.5 font-normal text-rose-300"
          onClick={() => session.id && window.confirm(`${fmtDate(session.startedAt)} 기록을 모두 삭제할까요?`) && deleteSession(session.id)}
        >
          이 날 전체 삭제
        </button>
      </p>
      <ul className="space-y-1">
        {[...byEx.entries()].map(([exId, list]) => {
          const name = getExercise(exId)?.name ?? exId;
          return (
            <li key={exId} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/60 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{name}</span>
                <span className="block text-xs text-slate-400 tabular-nums">{list.map((x) => `${x.weight}×${x.reps}`).join(', ')}</span>
              </span>
              <button
                type="button"
                aria-label={`${name} 기록 삭제`}
                className="shrink-0 rounded-lg border border-rose-900 px-2 py-1 text-xs text-rose-300"
                onClick={() => session.id && window.confirm(`${name} 기록을 삭제할까요?`) && deleteExerciseSets(session.id, exId)}
              >
                삭제
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
