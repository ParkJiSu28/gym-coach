import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CITATIONS, EVIDENCE_LABEL } from '../domain/research';
import type { EvidenceLevel } from '../domain/types';
import type { Reason } from '../engine/progression';

export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/70 p-4 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-slate-100">{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'subtle';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 active:bg-emerald-600',
  ghost: 'border border-slate-700 text-slate-200 hover:bg-slate-800',
  danger: 'border border-rose-800 text-rose-300 hover:bg-rose-950',
  subtle: 'bg-slate-800 text-slate-200 hover:bg-slate-700',
};

export function Button({ variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${BTN[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-300',
    emerald: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
    amber: 'bg-amber-950 text-amber-300 border border-amber-800',
    rose: 'bg-rose-950 text-rose-300 border border-rose-800',
    sky: 'bg-sky-950 text-sky-300 border border-sky-800',
  } as const;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

const LEVEL_TONE: Record<EvidenceLevel, 'emerald' | 'sky' | 'amber' | 'slate'> = {
  'meta-analysis': 'emerald',
  rct: 'emerald',
  consensus: 'sky',
  'expert-opinion': 'amber',
  model: 'slate',
};

export function CitationChip({ id }: { id: string }) {
  const c = CITATIONS[id];
  if (!c) return null;
  const label = `${c.short} · ${EVIDENCE_LABEL[c.level]}`;
  const tone = LEVEL_TONE[c.level];
  return c.doi ? (
    <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noreferrer" title={c.title} className="no-underline">
      <Badge tone={tone}>{label} ↗</Badge>
    </a>
  ) : (
    <span title={c.title}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}

/** 추천 근거를 접었다 펼치는 "왜?" 카드 */
export function WhyCard({ reasons, open = false }: { reasons: Reason[]; open?: boolean }) {
  if (reasons.length === 0) return null;
  return (
    <details open={open} className="mt-2 rounded-xl bg-slate-950/60 px-3 py-2 text-sm">
      <summary className="text-xs font-semibold text-emerald-300">왜 이렇게 추천하나요? ▾</summary>
      <ul className="mt-2 space-y-2">
        {reasons.map((r, i) => (
          <li key={i} className="text-slate-300">
            <p>{r.text}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {r.citations.map((c) => (
                <CitationChip key={c} id={c} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Stepper({
  value,
  onChange,
  step,
  min = 0,
  label,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  label: string;
  suffix?: string;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.round(v * 100) / 100));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex items-center rounded-xl border border-slate-700 bg-slate-950">
        <button type="button" aria-label={`${label} 감소`} className="h-11 w-10 text-lg text-slate-300" onClick={() => set(value - step)}>
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => set(Number(e.target.value))}
          className="h-11 w-full min-w-0 bg-transparent text-center text-lg font-semibold tabular-nums outline-none"
        />
        {suffix && <span className="pr-1 text-xs text-slate-500">{suffix}</span>}
        <button type="button" aria-label={`${label} 증가`} className="h-11 w-10 text-lg text-slate-300" onClick={() => set(value + step)}>
          +
        </button>
      </div>
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-sm text-slate-400">{children}</p>;
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function recoveryTone(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500';
  if (pct >= 70) return 'bg-lime-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}
