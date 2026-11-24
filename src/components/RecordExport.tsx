import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { db } from '../data/db';
import { useAllSets, useSessions } from '../data/hooks';
import type { Program } from '../domain/types';
import { exportText, longDate, routineKey, routineOptions, sessionsFor } from '../engine/recordExport';
import { Button, Card } from './ui';

const NO_PROGRAMS: Program[] = [];
const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm ${on ? 'border-emerald-500 bg-emerald-950 text-emerald-300' : 'border-slate-700 bg-slate-950 text-slate-300'}`;

/** 루틴과 수행 날짜를 골라 기록을 한 번에 텍스트로 복사 */
export function RecordExport() {
  const sessions = useSessions();
  const sets = useAllSets();
  const programs = useLiveQuery(() => db.programs.toArray(), [], NO_PROGRAMS);
  const [keys, setKeys] = useState<string[]>([]);
  /** 체크 해제한 세션 (기본은 고른 루틴의 날짜 전부 선택) */
  const [off, setOff] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const options = useMemo(() => routineOptions(programs, sessions, sets), [programs, sessions, sets]);
  const label = useMemo(() => new Map(options.map((o) => [o.key, o.label])), [options]);
  const list = useMemo(() => sessionsFor(keys, sessions, sets), [keys, sessions, sets]);
  const chosen = useMemo(() => list.filter((s) => !off.has(s.id!)).map((s) => s.id!), [list, off]);
  const text = useMemo(() => (chosen.length ? exportText(chosen, { programs, sessions, sets }) : ''), [chosen, programs, sessions, sets]);
  const setCount = useMemo(() => {
    const c = new Set(chosen);
    return sets.filter((x) => c.has(x.sessionId) && !x.warmup).length;
  }, [chosen, sets]);

  const changed = () => setCopied(false);
  const toggleKey = (k: string) => {
    changed();
    setKeys((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  };
  const toggleSession = (id: number) => {
    changed();
    setOff((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      boxRef.current?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
  }

  if (!options.length) return null;
  const all = keys.length === options.length;

  return (
    <Card title="기록 골라 복사하기">
      <p className="mb-2 text-xs text-slate-400">① 루틴 고르기 (여러 개 가능)</p>
      <div role="group" aria-label="복사할 루틴" className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o.key} type="button" aria-pressed={keys.includes(o.key)} onClick={() => toggleKey(o.key)} className={chip(keys.includes(o.key))}>
            {o.label} <span className="text-xs opacity-70">{o.count}회</span>
          </button>
        ))}
        <button type="button" onClick={() => (changed(), setKeys(all ? [] : options.map((o) => o.key)))} className="rounded-full px-3 py-1.5 text-sm text-sky-300">
          {all ? '전체 해제' : '전체'}
        </button>
      </div>

      {list.length > 0 && (
        <>
          <div className="mt-3 mb-1 flex items-center justify-between text-xs text-slate-400">
            <span>② 수행 날짜 고르기</span>
            <span className="flex gap-3">
              <button type="button" className="text-sky-300" onClick={() => (changed(), setOff(new Set()))}>
                모두 선택
              </button>
              <button type="button" className="text-sky-300" onClick={() => (changed(), setOff(new Set(list.map((s) => s.id!))))}>
                모두 해제
              </button>
            </span>
          </div>
          <ul aria-label="수행 날짜" className="max-h-72 space-y-1 overflow-y-auto rounded-xl bg-slate-950/50 p-1">
            {list.map((s) => (
              <li key={s.id}>
                <label className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-800">
                  <input type="checkbox" checked={!off.has(s.id!)} onChange={() => toggleSession(s.id!)} className="h-5 w-5 accent-emerald-500" />
                  <span className="tabular-nums">{longDate(s.startedAt)}</span>
                  <span className="flex-1 truncate text-sm text-slate-400">{label.get(routineKey(s))}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{sets.filter((x) => x.sessionId === s.id && !x.warmup).length}세트</span>
                </label>
              </li>
            ))}
          </ul>
          <textarea ref={boxRef} aria-label="복사할 기록" readOnly value={text} rows={4} onFocus={(e) => e.currentTarget.select()} className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs outline-none" />
          <Button className="mt-2 w-full py-3" onClick={copy} disabled={!chosen.length}>
            {copied ? `복사됨 ✓ (${chosen.length}회 · ${setCount}세트)` : `${chosen.length}회 기록 복사`}
          </Button>
        </>
      )}
    </Card>
  );
}
