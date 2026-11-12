import { useEffect, useRef, useState } from 'react';
import { restDoneAlert } from '../lib/alert';
import { adjustRestTarget, restStatus } from '../engine/timer';
import { fmtDuration } from './ui';

/**
 * 세트 완료 시점부터 자동으로 도는 휴식 타이머.
 * setKey(마지막 세트 id)가 바뀌면 목표 시간 조절값이 초기화된다.
 */
export function RestTimer({ startedAt, defaultTarget, now, setKey }: { startedAt: number; defaultTarget: number; now: number; setKey: number | undefined }) {
  const [target, setTarget] = useState(defaultTarget);
  const alerted = useRef<number | undefined>(undefined);

  useEffect(() => setTarget(defaultTarget), [setKey, defaultTarget]);

  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const st = restStatus(elapsed, target);

  useEffect(() => {
    if (st.done && setKey !== undefined && alerted.current !== setKey) {
      alerted.current = setKey;
      restDoneAlert();
    }
  }, [st.done, setKey]);

  return (
    <div
      role="timer"
      aria-live="off"
      className={`sticky top-2 z-10 rounded-2xl border px-4 py-3 backdrop-blur ${st.done ? 'border-emerald-500 bg-emerald-950/90' : 'border-slate-700 bg-slate-900/90'}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">{st.done ? '휴식 끝 — 다음 세트!' : '휴식 중'}</span>
        <span className="text-3xl font-bold tabular-nums">{st.done ? `+${fmtDuration(elapsed - target)}` : fmtDuration(st.remainingSec)}</span>
        <span className="text-sm text-slate-400 tabular-nums">목표 {fmtDuration(target)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-emerald-400 transition-all" style={{ width: `${st.progress * 100}%` }} />
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" aria-label="휴식 -15초" className="flex-1 rounded-lg bg-slate-800 py-2 text-sm" onClick={() => setTarget((t) => adjustRestTarget(t, -15))}>
          −15초
        </button>
        <button type="button" aria-label="휴식 +15초" className="flex-1 rounded-lg bg-slate-800 py-2 text-sm" onClick={() => setTarget((t) => adjustRestTarget(t, 15))}>
          +15초
        </button>
      </div>
    </div>
  );
}
