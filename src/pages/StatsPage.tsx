import { useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, CitationChip, Empty, WhyCard, fmtDate } from '../components/ui';
import { BackupError, deleteSession, exportAll, importAll } from '../data/db';
import { useAllSets, useAnalysisNow, useSessions } from '../data/hooks';
import { getExercise } from '../domain/exercises';
import { VOLUME_LANDMARKS } from '../domain/research';
import { MUSCLES, MUSCLE_LABEL } from '../domain/types';
import { PLATEAU_TIPS, detectPlateau } from '../engine/analysis';
import { buildReport, type Report } from '../engine/report';
import { exerciseHistory, sessionBestE1RM } from '../engine/progression';
import { VOLUME_STATUS_LABEL, WEEK_MS, muscleFrequency, volumeStatus, weeklyVolume } from '../engine/volume';

const STATUS_TONE = {
  below_mev: 'rose',
  low: 'amber',
  optimal: 'emerald',
  high: 'amber',
  over_mrv: 'rose',
} as const;

export function StatsPage() {
  const sets = useAllSets();
  const now = useAnalysisNow(sets);
  const sessions = useSessions();

  const weekly = useMemo(() => weeklyVolume(sets, now), [sets, now]);
  const report = useMemo(() => buildReport({ sets, now }), [sets, now]);
  const freq = useMemo(() => muscleFrequency(sets, now - WEEK_MS, now + 1), [sets, now]);

  const exerciseIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sets) if (!s.warmup) counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [sets]);
  const [selected, setSelected] = useState<string>('');
  const exId = selected || exerciseIds[0] || '';

  const series = useMemo(
    () =>
      exerciseHistory(sets, exId).map((h) => ({
        date: new Date(h.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
        e1rm: Math.round(sessionBestE1RM(h) * 10) / 10,
        top: Math.max(...h.sets.map((s) => s.weight)),
      })),
    [sets, exId],
  );

  const plateaus = useMemo(
    () =>
      exerciseIds
        .map((id) => ({ id, r: detectPlateau(exerciseHistory(sets, id)) }))
        .filter((x) => x.r.plateau),
    [sets, exerciseIds],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">분석</h1>

      <ReportCard report={report} />

      <Card title="최근 7일 부위별 볼륨">
        <p className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-400">
          하드 세트 기준 · 간접 자극 0.5세트 · 초록 띠 = 최적 범위
          <CitationChip id="schoenfeld2017volume" />
          <CitationChip id="pelland2024" />
        </p>
        <ul className="space-y-2.5">
          {MUSCLES.map((m) => {
            const l = VOLUME_LANDMARKS[m];
            const max = l.mrv + 4;
            const v = weekly[m];
            const st = volumeStatus(m, v);
            const pct = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
            return (
              <li key={m}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>
                    {MUSCLE_LABEL[m]} <span className="text-xs text-slate-500">주 {freq[m]}회</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{v}세트</span>
                    <Badge tone={STATUS_TONE[st]}>{VOLUME_STATUS_LABEL[st]}</Badge>
                  </span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-800" aria-label={`${MUSCLE_LABEL[m]} ${v}세트, 최적 ${l.mavLow}~${l.mavHigh}`}>
                  <div className="absolute inset-y-0 bg-emerald-900/70" style={{ left: pct(l.mavLow), width: `calc(${pct(l.mavHigh)} - ${pct(l.mavLow)})` }} />
                  <div className="absolute inset-y-0 w-px bg-rose-500/70" style={{ left: pct(l.mrv) }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-sky-400" style={{ width: pct(v) }} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-500">빨간 선 = 회복 한계 추정치(MRV). 부위별 주 2회 이상 빈도가 권장됩니다.</p>
      </Card>

      <Card
        title="추정 1RM 추이"
        right={
          exerciseIds.length > 0 && (
            <select value={exId} onChange={(e) => setSelected(e.target.value)} className="max-w-44 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm">
              {exerciseIds.map((id) => (
                <option key={id} value={id}>
                  {getExercise(id)?.name ?? id}
                </option>
              ))}
            </select>
          )
        }
      >
        {series.length < 2 ? (
          <Empty>같은 종목을 2회 이상 기록하면 추세가 표시됩니다.</Empty>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8 }} />
                <Line type="monotone" dataKey="e1rm" name="추정 1RM" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="top" name="최고 무게" stroke="#0284c7" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          추정 1RM = 무게 × (1 + (반복 + RIR) / 30) <CitationChip id="epley1985" />
        </p>
      </Card>

      {plateaus.length > 0 && (
        <Card title="정체 구간 감지" className="border-amber-800">
          <ul className="space-y-1 text-sm">
            {plateaus.map(({ id, r }) => (
              <li key={id}>
                <b>{getExercise(id)?.name ?? id}</b> — 최근 {r.sessionsSincePR}세션 동안 기록 갱신 없음 (최고 추정 1RM {r.bestE1RM.toFixed(1)}kg)
              </li>
            ))}
          </ul>
          <WhyCard reasons={PLATEAU_TIPS} open />
        </Card>
      )}

      <Card title="운동 이력">
        {sessions.filter((s) => s.endedAt).length === 0 ? (
          <Empty>완료된 운동이 없습니다.</Empty>
        ) : (
          <ul className="divide-y divide-slate-800">
            {sessions
              .filter((s) => s.endedAt)
              .slice(0, 30)
              .map((s) => {
                const ss = sets.filter((x) => x.sessionId === s.id && !x.warmup);
                const tonnage = ss.reduce((a, x) => a + x.weight * x.reps, 0);
                const mins = Math.round(((s.endedAt ?? s.startedAt) - s.startedAt) / 60_000);
                const names = [...new Set(ss.map((x) => getExercise(x.exerciseId)?.name ?? x.exerciseId))];
                return (
                  <li key={s.id} className="py-2.5">
                    <details>
                      <summary className="flex items-center justify-between text-sm">
                        <span>
                          {fmtDate(s.startedAt)} <span className="text-slate-500">· {s.manual ? "직접 입력" : `${mins}분`} · {ss.length}세트</span>
                        </span>
                        <span className="text-xs text-slate-400 tabular-nums">{Math.round(tonnage).toLocaleString()}kg</span>
                      </summary>
                      <p className="mt-1 text-xs text-slate-400">{names.join(', ')}</p>
                      <Button
                        variant="danger"
                        className="mt-2 px-3 py-1 text-xs"
                        onClick={() => s.id && window.confirm('이 운동 기록을 삭제할까요?') && deleteSession(s.id)}
                      >
                        기록 삭제
                      </Button>
                    </details>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      <BackupCard />
    </div>
  );
}

function ReportCard({ report }: { report: Report }) {
  return (
    <Card title="분석 리포트">
      {!report.hasData ? (
        <Empty>최근 4주 기록이 없습니다. 운동을 기록하거나 지난 기록을 입력하면 부위별로 논문 기준 분석을 보여드립니다.</Empty>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-400">최근 7일 기준 · 근비대 목적 · 문제 있는 부위부터</p>
          <ul className="space-y-2">
            {report.muscles.map((m) => (
              <li key={m.muscle} className="rounded-xl bg-slate-950/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{MUSCLE_LABEL[m.muscle]}</span>
                  <Badge tone={STATUS_TONE[m.status]}>{VOLUME_STATUS_LABEL[m.status]}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  주 {m.weeklySets}세트 · 주 {m.frequency}회 · 권장 {m.mavLow}~{m.mavHigh}세트
                </p>
                <p className="mt-1 text-sm text-slate-300">{m.action.text}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.action.citations.map((c) => (
                    <CitationChip key={c} id={c} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {report.tips.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold">훈련 방식 점검</p>
              <WhyCard reasons={report.tips} open />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function BackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function download() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg({ ok: true, text: `세트 ${data.sets.length}개를 내보냈습니다.` });
  }

  async function upload(file: File) {
    if (!window.confirm('현재 기기의 모든 기록이 백업 파일 내용으로 교체됩니다. 계속할까요?')) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      await importAll(raw);
      setMsg({ ok: true, text: '백업을 불러왔습니다.' });
    } catch (err) {
      const text = err instanceof BackupError ? err.message : err instanceof SyntaxError ? 'JSON 파일이 아닙니다.' : '가져오기에 실패했습니다.';
      if (!(err instanceof BackupError)) console.error('백업 가져오기 실패', err);
      setMsg({ ok: false, text });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <Card title="백업 · 복원">
      <p className="mb-3 text-sm text-slate-400">기록은 이 기기 브라우저에만 저장됩니다. 주기적으로 백업 파일을 내려받아 두세요.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={download}>
          백업 내보내기
        </Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          백업 불러오기
        </Button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p>}
    </Card>
  );
}
