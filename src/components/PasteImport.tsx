import { useMemo, useState } from 'react';
import { addManualEntry } from '../data/db';
import { allExercises } from '../domain/exercises';
import { parseWorkoutText, type ParsedSet } from '../engine/importText';
import { ManualRecordError } from '../engine/records';
import { Button, Card } from './ui';

function toDateStr(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseLocalDate(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d).getTime() : Number.NaN;
}

interface Item {
  name: string;
  exerciseId: string;
  sets: ParsedSet[];
  include: boolean;
}

const fieldCls = 'h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-2 text-base outline-none focus:border-emerald-500';

/** 다른 앱 캡처 → 아이폰 "텍스트 인식"으로 복사한 글자를 붙여넣어 기록 가져오기 */
export function PasteImport() {
  const exercises = useMemo(() => [...allExercises()].sort((a, b) => a.name.localeCompare(b.name, 'ko')), []);
  const [text, setText] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [title, setTitle] = useState<string | undefined>();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [date, setDate] = useState(() => toDateStr(Date.now()));
  const [editing, setEditing] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function analyze() {
    const r = parseWorkoutText(text);
    setTitle(r.title);
    setSkipped(r.skipped);
    if (r.date !== undefined) setDate(toDateStr(r.date));
    setItems(r.exercises.map((e) => ({ name: e.name, exerciseId: e.exerciseId ?? '', sets: e.sets, include: e.sets.length > 0 })));
    setMsg(r.exercises.length === 0 ? { ok: false, text: '종목·세트를 찾지 못했습니다. 기록 화면의 글자를 모두 선택해 복사했는지 확인하세요.' } : null);
  }

  const update = (i: number, patch: Partial<Item>) => setItems((list) => list && list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const chosen = (items ?? []).filter((x) => x.include && x.sets.length > 0);
  const missing = chosen.filter((x) => !x.exerciseId);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const day = parseLocalDate(date);
      for (const x of chosen) await addManualEntry({ date: day, exerciseId: x.exerciseId, sets: x.sets });
      const total = chosen.reduce((a, x) => a + x.sets.length, 0);
      setMsg({ ok: true, text: `${chosen.length}개 종목 · ${total}세트 저장됨` });
      setItems(null);
      setText('');
    } catch (err) {
      if (err instanceof ManualRecordError) setMsg({ ok: false, text: err.message });
      else {
        console.error('가져오기 저장 실패', err);
        setMsg({ ok: false, text: '저장에 실패했습니다.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="캡처 글자로 가져오기">
      <details className="mb-3 text-sm text-slate-400">
        <summary className="font-semibold text-emerald-300">아이폰에서 하는 법 ▾</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>다른 앱의 운동 기록 화면을 캡처합니다.</li>
          <li>사진 앱에서 캡처를 열고 글자를 길게 눌러 선택 → <b>모두 선택</b> → <b>복사</b>.</li>
          <li>아래 칸을 길게 눌러 <b>붙여넣기</b> → <b>분석</b>.</li>
          <li>날짜와 인식 결과를 확인·수정하고 저장합니다. 여러 장이면 한 장씩 반복하세요.</li>
        </ol>
      </details>
      <textarea
        aria-label="복사한 글자 붙여넣기"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'예)\n힙 쓰러스트 머신\n1\n40 kg\n10회'}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-base outline-none focus:border-emerald-500"
      />
      <Button className="mt-2 w-full" onClick={analyze} disabled={!text.trim()}>
        분석
      </Button>

      {items && items.length > 0 && (
        <div className="mt-4 space-y-3">
          {title && (
            <p className="text-sm text-slate-400">
              루틴: <span className="text-slate-200">{title}</span>
            </p>
          )}
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            운동한 날짜
            <input type="date" value={date} max={toDateStr(Date.now())} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
          </label>

          {items.map((x, i) => (
            <fieldset key={i} aria-label={x.name || '이름 없는 종목'} className={`rounded-xl border p-3 ${x.include ? 'border-slate-700 bg-slate-950/50' : 'border-slate-800 opacity-60'}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">인식: {x.name || '(이름 없음)'}</span>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={x.include} disabled={x.sets.length === 0} onChange={(e) => update(i, { include: e.target.checked })} className="h-4 w-4 accent-emerald-500" />
                  저장
                </label>
              </div>
              <select aria-label="종목" value={x.exerciseId} onChange={(e) => update(i, { exerciseId: e.target.value })} className={fieldCls}>
                <option value="">종목을 선택하세요…</option>
                {exercises.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              {x.sets.length === 0 ? (
                <p className="mt-2 text-sm text-amber-300">세트 없음 — 캡처에서 잘렸을 수 있어요. 다음 캡처로 가져오세요.</p>
              ) : editing === i ? (
                <SetsEditor sets={x.sets} onChange={(sets) => update(i, { sets })} onDone={() => setEditing(null)} />
              ) : (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm tabular-nums text-slate-200">{x.sets.map((s) => `${s.weight}×${s.reps}`).join(', ')}</span>
                  <button type="button" className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-xs" onClick={() => setEditing(i)}>
                    세트 수정
                  </button>
                </div>
              )}
            </fieldset>
          ))}

          {skipped.length > 0 && <p className="text-xs text-amber-300">범위를 벗어난 값 {skipped.length}개는 제외했습니다: {skipped.join(' / ')}</p>}
          {missing.length > 0 && <p className="text-xs text-rose-300">종목을 선택하지 않은 항목이 {missing.length}개 있습니다.</p>}
          <Button className="w-full py-3" onClick={save} disabled={busy || chosen.length === 0 || missing.length > 0}>
            {chosen.length}개 종목 저장
          </Button>
        </div>
      )}

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
    </Card>
  );
}

function SetsEditor({ sets, onChange, onDone }: { sets: ParsedSet[]; onChange: (s: ParsedSet[]) => void; onDone: () => void }) {
  const set = (i: number, patch: Partial<ParsedSet>) => onChange(sets.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="mt-2 space-y-1.5">
      {sets.map((s, i) => (
        <div key={i} className="grid grid-cols-[2rem_1fr_1fr_2rem] items-center gap-1.5">
          <span className="text-center text-sm text-slate-500">{i + 1}</span>
          <input aria-label={`${i + 1}세트 무게`} type="number" inputMode="decimal" value={s.weight} onChange={(e) => set(i, { weight: Number(e.target.value) })} className={`${fieldCls} text-center`} />
          <input aria-label={`${i + 1}세트 반복`} type="number" inputMode="numeric" value={s.reps} onChange={(e) => set(i, { reps: Number(e.target.value) })} className={`${fieldCls} text-center`} />
          <button type="button" aria-label={`${i + 1}세트 삭제`} className="text-slate-500 hover:text-rose-400" onClick={() => onChange(sets.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <Button variant="subtle" className="w-full" onClick={onDone}>
        수정 완료
      </Button>
    </div>
  );
}
