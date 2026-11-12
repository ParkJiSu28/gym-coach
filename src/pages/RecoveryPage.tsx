import { useMemo } from 'react';
import { CheckinForm } from '../components/CheckinForm';
import { Badge, Card, CitationChip, WhyCard, fmtDate, recoveryTone } from '../components/ui';
import { useActiveProgram, useAllSets, useAnalysisNow, useCheckins } from '../data/hooks';
import { MUSCLE_LABEL, type Muscle } from '../domain/types';
import { deloadAdvice } from '../engine/analysis';
import { hoursUntilRecovered, muscleRecovery, readinessScore, systemicLoad } from '../engine/fatigue';

const GROUPS: { name: string; muscles: Muscle[] }[] = [
  { name: '상체 앞', muscles: ['chest', 'front_delts', 'side_delts', 'biceps', 'forearms'] },
  { name: '상체 뒤', muscles: ['lats', 'upper_back', 'rear_delts', 'triceps', 'lower_back'] },
  { name: '하체·코어', muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'] },
];

const LOAD_LABEL = { low: '낮음', normal: '적정', elevated: '높아짐', high: '급증' } as const;
const LOAD_TONE = { low: 'slate', normal: 'emerald', elevated: 'amber', high: 'rose' } as const;

export function RecoveryPage() {
  const sets = useAllSets();
  const now = useAnalysisNow(sets);
  const checkins = useCheckins();
  const program = useActiveProgram();

  const recovery = useMemo(() => muscleRecovery(sets, now), [sets, now]);
  const load = useMemo(() => systemicLoad(sets, now), [sets, now]);
  const advice = useMemo(() => deloadAdvice({ program: program ?? undefined, sets, checkins, now }), [program, sets, checkins, now]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">회복 · 피로도</h1>

      {GROUPS.map((g) => (
        <Card key={g.name} title={g.name}>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {g.muscles.map((m) => {
              const v = recovery[m];
              const h = v < 80 ? hoursUntilRecovered(sets, m, now) : 0;
              return (
                <li key={m} className="rounded-xl bg-slate-950/50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{MUSCLE_LABEL[m]}</span>
                    <span className="tabular-nums">{v}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full transition-all ${recoveryTone(v)}`} style={{ width: `${v}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{v >= 80 ? '훈련 가능' : `80% 회복까지 약 ${h}시간`}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      <p className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        회복도는 세트 수·실패 근접도·경과 시간으로 계산한 추정치입니다. <CitationChip id="app_fatigue_model" />
      </p>

      <Card title="전신 부하" right={<Badge tone={LOAD_TONE[load.level]}>{LOAD_LABEL[load.level]}</Badge>}>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-slate-400">최근 7일</dt>
            <dd className="text-xl font-bold tabular-nums">{load.acute}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">평소 주평균</dt>
            <dd className="text-xl font-bold tabular-nums">{load.chronic}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">비율</dt>
            <dd className="text-xl font-bold tabular-nums">{load.ratio ?? '—'}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-slate-500">하드 세트(RIR ≤ 4) 기준. 비율이 1.5를 넘으면 볼륨이 갑자기 늘어난 것입니다. 2주 이상 기록이 쌓이면 계산됩니다.</p>
      </Card>

      <Card title="디로딩 판단" right={<Badge tone={advice.recommend ? 'amber' : 'emerald'}>{advice.recommend ? '권장' : '불필요'}</Badge>}>
        {advice.signals.length === 0 ? (
          <p className="text-sm text-slate-400">피로 누적 신호가 없습니다. 계획대로 진행하세요.</p>
        ) : (
          <WhyCard reasons={advice.signals} open />
        )}
      </Card>

      <Card title="컨디션 체크인">
        <CheckinForm />
        {checkins.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-slate-800 pt-3 text-sm">
            {checkins.slice(0, 7).map((c) => (
              <li key={c.id} className="flex justify-between text-slate-300">
                <span>{fmtDate(c.date)}</span>
                <span className="tabular-nums">
                  수면 {c.sleep} · 근육통 {c.soreness} · 의욕 {c.motivation} · 스트레스 {c.stress} → <b>{readinessScore(c)}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
