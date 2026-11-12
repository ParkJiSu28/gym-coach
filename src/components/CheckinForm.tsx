import { useState } from 'react';
import { db } from '../data/db';
import type { Checkin } from '../domain/types';
import { readinessScore } from '../engine/fatigue';
import { Button } from './ui';

const FIELDS: { key: keyof Omit<Checkin, 'id' | 'date'>; label: string; low: string; high: string }[] = [
  { key: 'sleep', label: '수면', low: '못 잠', high: '푹 잠' },
  { key: 'soreness', label: '근육통', low: '심함', high: '없음' },
  { key: 'motivation', label: '의욕', low: '없음', high: '최고' },
  { key: 'stress', label: '스트레스', low: '심함', high: '없음' },
];

export function CheckinForm({ onSaved }: { onSaved?: () => void }) {
  const [v, setV] = useState({ sleep: 3, soreness: 3, motivation: 3, stress: 3 });
  const [saving, setSaving] = useState(false);
  const score = readinessScore({ date: 0, ...v });

  async function save() {
    setSaving(true);
    try {
      await db.checkins.add({ date: Date.now(), ...v });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-200">{f.label}</span>
            <span>
              {f.low} ↔ {f.high}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setV({ ...v, [f.key]: n })}
                className={`h-9 rounded-lg text-sm font-semibold ${v[f.key] === n ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">
          컨디션 점수 <b className="text-lg text-emerald-300 tabular-nums">{score}</b>/100
        </span>
        <Button onClick={save} disabled={saving}>
          체크인 저장
        </Button>
      </div>
    </div>
  );
}
