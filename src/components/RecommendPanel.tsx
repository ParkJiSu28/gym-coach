import { useState } from 'react';
import { saveActiveProgram } from '../data/db';
import { useAllSets, useCheckins, useSessions } from '../data/hooks';
import { ACTION_LABEL } from '../engine/progression';
import { recommendFromRecords, type Recommendation } from '../engine/recommend';
import { WEEKDAY_LABEL, weekdayPlan } from '../engine/schedule';
import { dayDurationMin } from '../engine/splits';
import { Badge, Button, Card, WhyCard } from './ui';
import { WeekdayPicker } from './WeekdayPicker';

/** 버튼 하나로: 내 기록 → 분할·요일·종목·세트·무게·반복·휴식 */
export function RecommendPanel({ initialWeekdays = [], onApplied }: { initialWeekdays?: number[]; onApplied?: () => void }) {
  const sets = useAllSets();
  const sessions = useSessions();
  const checkins = useCheckins();
  const [weekdays, setWeekdays] = useState<number[]>(initialWeekdays);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [busy, setBusy] = useState(false);

  function run() {
    setRec(
      recommendFromRecords({
        sets,
        sessions,
        checkins,
        now: Date.now(),
        overrides: weekdays.length >= 2 ? { weekdays } : undefined,
      }),
    );
  }

  async function apply() {
    if (!rec) return;
    setBusy(true);
    try {
      await saveActiveProgram({ ...rec.program, createdAt: Date.now(), mesoStart: Date.now() });
      setRec(null);
      onApplied?.();
    } finally {
      setBusy(false);
    }
  }

  const byDayId = new Map(rec ? weekdayPlan(rec.program).map((x) => [x.day.id, x.weekday]) : []);

  return (
    <>
      <Card title="기록 기반 추천">
        <p className="mb-2 text-sm text-slate-400">운동 가능한 요일을 고르세요. 고르지 않으면 지난 기록에서 자주 운동한 요일로 정합니다.</p>
        <WeekdayPicker value={weekdays} onChange={setWeekdays} />
        {weekdays.length === 1 && <p className="mt-1 text-xs text-amber-300">요일은 2일 이상 골라주세요.</p>}
        <Button className="mt-3 w-full py-3 text-base" onClick={run}>
          내 기록으로 루틴 추천
        </Button>
      </Card>

      {rec && (
        <Card title="추천 결과" className="border-emerald-700">
          <p className="text-sm text-slate-300">
            <b>{rec.program.name}</b> · 세션당 약 {rec.sessionMinutes}분
          </p>
          <WhyCard reasons={rec.insights} open />
          <div className="mt-3 space-y-3">
            {rec.plans.map(({ day, exercises }) => {
              const wd = byDayId.get(day.id);
              return (
                <div key={day.id} className="rounded-xl bg-slate-950/50 p-3">
                  <p className="mb-2 flex justify-between font-semibold">
                    <span>
                      {wd !== undefined && <span className="mr-1 text-emerald-300">{WEEKDAY_LABEL[wd]}</span>}
                      {day.name}
                    </span>
                    <span className="text-sm font-normal text-slate-400">약 {dayDurationMin(day)}분</span>
                  </p>
                  <ul className="space-y-2 text-sm">
                    {exercises.map((p) => {
                      const s = p.suggestion;
                      return (
                        <li key={p.exercise.id}>
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium">{p.exercise.name}</span>
                            <Badge tone={s.action === 'increase_load' ? 'emerald' : s.action === 'start' ? 'sky' : 'slate'}>{ACTION_LABEL[s.action]}</Badge>
                          </div>
                          <p className="text-slate-300 tabular-nums">
                            {s.weight === null ? '무게 찾기' : `${s.weight}kg`} × {s.repsTarget}회 × {s.sets}세트 · RIR {s.rir} · 휴식 {Math.round((s.restSec / 60) * 10) / 10}분
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setRec(null)}>
              닫기
            </Button>
            <Button className="flex-1 py-3" onClick={apply} disabled={busy}>
              이 루틴 적용
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
