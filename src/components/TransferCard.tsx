import { useRef, useState } from 'react';
import { createTransferCode, mergeTransfer, parseTransferCode, TransferError } from '../data/transfer';
import { Button, Card } from './ui';

const RANGES = [
  { label: '전체', days: undefined },
  { label: '최근 30일', days: 30 },
  { label: '최근 7일', days: 7 },
] as const;

const boxCls = 'w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-base outline-none focus:border-emerald-500';

/** PC ↔ 폰 기록 옮기기: 한 줄 코드로 보내고, 받는 쪽 기록에 합친다 (서버 없음) */
export function TransferCard() {
  const [range, setRange] = useState(0);
  const [sent, setSent] = useState<{ code: string; sessions: number; sets: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [incoming, setIncoming] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLTextAreaElement>(null);

  async function make() {
    setCopied(false);
    setSent(await createTransferCode({ sinceDays: RANGES[range]!.days }));
  }

  async function copy() {
    if (!sent) return;
    try {
      await navigator.clipboard.writeText(sent.code);
    } catch {
      codeRef.current?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
  }

  async function receive() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await mergeTransfer(await parseTransferCode(incoming));
      const parts = [r.addedSets > 0 ? `세션 ${r.addedSessions}개 · ${r.addedSets}세트 추가` : '새 기록 없음'];
      if (r.skippedSets > 0) parts.push(`이미 있는 ${r.skippedSets}세트는 건너뜀`);
      if (r.addedExercises > 0) parts.push(`종목 ${r.addedExercises}개 추가`);
      if (r.addedCheckins > 0) parts.push(`컨디션 기록 ${r.addedCheckins}개 추가`);
      setMsg({ ok: true, text: parts.join(' · ') });
      setIncoming('');
    } catch (err) {
      if (err instanceof TransferError) setMsg({ ok: false, text: err.message });
      else {
        console.error('기록 받기 실패', err);
        setMsg({ ok: false, text: '기록을 합치지 못했습니다.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="기기 간 기록 옮기기">
      <p className="mb-3 text-sm text-slate-400">PC에서 입력한 기록을 폰으로(또는 반대로) 옮깁니다. 받는 쪽 기록은 지워지지 않고 합쳐집니다.</p>

      <div className="rounded-xl bg-slate-950/50 p-3">
        <p className="mb-2 text-sm font-semibold">① 보내기 — 이 기기 → 다른 기기</p>
        <div className="flex gap-2">
          <select aria-label="보낼 범위" value={range} onChange={(e) => setRange(Number(e.target.value))} className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-2 text-base">
            {RANGES.map((r, i) => (
              <option key={r.label} value={i}>
                {r.label}
              </option>
            ))}
          </select>
          <Button variant="ghost" className="flex-1" onClick={make}>
            보낼 코드 만들기
          </Button>
        </div>
        {sent && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-slate-400">
              {sent.sessions}개 세션 · {sent.sets}세트 · 코드 {sent.code.length.toLocaleString()}자
            </p>
            <textarea ref={codeRef} aria-label="보낼 코드" readOnly value={sent.code} rows={3} onFocus={(e) => e.currentTarget.select()} className={`${boxCls} font-mono text-xs`} />
            <Button className="w-full" onClick={copy}>
              {copied ? '복사됨' : '코드 복사'}
            </Button>
            <p className="text-xs text-slate-500">카카오톡 "나와의 채팅"(또는 메모·메일)에 붙여넣어 보내고, 받는 기기에서 그 메시지를 복사하세요.</p>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-slate-950/50 p-3">
        <p className="mb-2 text-sm font-semibold">② 받기 — 다른 기기 → 이 기기</p>
        <textarea
          aria-label="받은 코드 붙여넣기"
          value={incoming}
          onChange={(e) => setIncoming(e.target.value)}
          rows={3}
          placeholder="GC1.… 로 시작하는 코드를 붙여넣으세요"
          className={`${boxCls} font-mono text-xs`}
        />
        <Button className="mt-2 w-full" onClick={receive} disabled={busy || !incoming.trim()}>
          받기 (기존 기록에 합치기)
        </Button>
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
      </div>
    </Card>
  );
}
