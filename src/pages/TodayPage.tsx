import { useMemo, useState } from 'react';
import type { Tab } from '../App';
import { CheckinForm } from '../components/CheckinForm';
import { Badge, Button, Card, Empty, WhyCard, fmtDate, recoveryTone } from '../components/ui';
import { db, startSession } from '../data/db';
import { useActiveProgram, useAllSets, useAnalysisNow, useCheckins, useOpenSession, useSessions } from '../data/hooks';
import { MUSCLE_LABEL, type Muscle } from '../domain/types';
import { buildContext, planDay } from '../engine/planner';
import { ACTION_LABEL } from '../engine/progression';
import { scheduledDayFor, upcomingSessions, WEEKDAY_LABEL } from '../engine/schedule';
import { dayDurationMin, nextProgramDay } from '../engine/splits';
import { RecommendPanel } from '../components/RecommendPanel';
import { WEEK_MS } from '../engine/volume';

export function TodayPage({ go }: { go: (t: Tab) => void }) {
  const sets = useAllSets();
  const now = useAnalysisNow(sets);
  const sessions = useSessions();
  const checkins = useCheckins();
  const program = useActiveProgram();
  const open = useOpenSession();
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const ctx = useMemo(() => buildContext({ now, sets, checkins, program: program ?? undefined }), [now, sets, checkins, program]);
  const rotationDay = program ? nextProgramDay(program, sessions) : undefined;
  // 요일 일정이 있으면 오늘 요일의 세션(없으면 휴식일), 없으면 순환 순서
  const scheduled = program ? scheduledDayFor(program, now) : undefined;
  const restDay = scheduled === null;
  const nextUp = program && restDay ? upcomingSessions(program, now, 1)[0] : undefined;
  const autoDay = scheduled === undefined ? rotationDay : (scheduled ?? nextUp?.day);
  const picked = program?.days.find((d) => d.id === pickedId);
  const day = picked ?? autoDay;
  const plan = useMemo(() => (day ? planDay(ctx, day) : []), [ctx, day]);

  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  // 오늘 끝낸 운동 (직접 입력 기록 제외)
  const doneToday = sessions.filter((s) => !s.manual && s.endedAt && s.startedAt >= startOfDay).sort((a, b) => b.endedAt! - a.endedAt!)[0];
  const doneSets = doneToday ? sets.filter((s) => s.sessionId === doneToday.id && !s.warmup) : [];
  const checkedInToday = checkins.some((c) => c.date >= startOfDay);
  const fatigued = (Object.entries(ctx.recovery) as [Muscle, number][]).filter(([, v]) => v < 90).sort((a, b) => a[1] - b[1]);

  async function startDay() {
    if (!program?.id || !day) return;
    await startSession({ programId: program.id, dayId: day.id });
    go('log');
  }

  async function startDeloadNow() {
    if (!program?.id) return;
    await db.programs.update(program.id, { mesoStart: now - program.mesoWeeks * WEEK_MS });
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-slate-400">{fmtDate(now)}</p>
        <h1 className="text-2xl font-bold">오늘의 계획</h1>
        {ctx.meso && (
          <div className="mt-2 flex flex-wrap gap-2">
            {ctx.meso.isDeload ? (
              <Badge tone="sky">디로딩 주 (사이클 {ctx.meso.cycle})</Badge>
            ) : (
              <Badge tone="emerald">
                메소사이클 {ctx.meso.week}/{ctx.meso.totalWeeks}주차 · 사이클 {ctx.meso.cycle}
              </Badge>
            )}
            {ctx.readiness !== null && <Badge tone={ctx.readiness >= 60 ? 'emerald' : ctx.readiness >= 40 ? 'amber' : 'rose'}>컨디션 {ctx.readiness}</Badge>}
          </div>
        )}
      </header>

      {open && (
        <Card className="border-emerald-700">
          <div className="flex items-center justify-between">
            <p className="text-sm">진행 중인 운동이 있습니다.</p>
            <Button onClick={() => go('log')}>이어하기</Button>
          </div>
        </Card>
      )}

      {ctx.advice.recommend && !ctx.advice.scheduled && (
        <Card title="⚠ 디로딩 권장" className="border-amber-700">
          <WhyCard reasons={ctx.advice.signals} open />
          {program && (
            <Button variant="ghost" className="mt-3 w-full" onClick={startDeloadNow}>
              이번 주를 디로딩 주로 전환
            </Button>
          )}
        </Card>
      )}


      {!checkedInToday && (
        <Card title="컨디션 체크인" right={<Button variant="subtle" onClick={() => setCheckinOpen(!checkinOpen)}>{checkinOpen ? '닫기' : '체크인'}</Button>}>
          <p className="text-sm text-slate-400">수면·근육통·의욕·스트레스를 기록하면 오늘 세트 수를 컨디션에 맞게 조절합니다.</p>
          {checkinOpen && (
            <div className="mt-3">
              <CheckinForm onSaved={() => setCheckinOpen(false)} />
            </div>
          )}
        </Card>
      )}

      {program === null && (
        <Card title="루틴이 없습니다">
          <Empty>주당 운동 가능 일수와 시간을 입력하면 근거 기반 루틴을 만들어 드립니다.</Empty>
          <Button className="mt-3 w-full" onClick={() => go('program')}>
            루틴 만들기
          </Button>
        </Card>
      )}

      {doneToday && !open && doneSets.length > 0 && (
        <Card title="오늘 운동 완료 ✓" className="border-emerald-700">
          <p className="text-sm text-slate-300 tabular-nums">
            {doneSets.length}세트 · 총 {Math.round(doneSets.reduce((a, s) => a + s.weight * s.reps, 0)).toLocaleString()}kg · {Math.max(1, Math.round((doneToday.endedAt! - doneToday.startedAt) / 60_000))}분
          </p>
          <p className="mt-1 text-xs text-slate-400">회복·분석 탭에 바로 반영됐습니다.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => go('recovery')}>
              회복 보기
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => go('stats')}>
              분석 보기
            </Button>
          </div>
        </Card>
      )}

      {program && program.days.length > 1 && (
        <Card title="오늘 할 루틴">
          <div role="group" aria-label="오늘 할 루틴" className="grid grid-cols-2 gap-2">
            {program.days.map((d) => {
              const on = d.id === day?.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPickedId(d.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${on ? 'border-emerald-500 bg-emerald-950 text-emerald-300' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
                >
                  <span className="block font-semibold">{d.name}</span>
                  <span className="text-xs text-slate-500">
                    {d.exercises.length}종목 · 약 {dayDurationMin(d)}분{d.id === autoDay?.id ? ' · 추천 순서' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {program && day && (
        <Card
          title={
            <span>
              {picked ? `선택: ${day.name}` : restDay ? `오늘은 휴식일 · 다음: ${nextUp ? WEEKDAY_LABEL[new Date(nextUp.date).getDay()] + ' ' : ''}${day.name}` : scheduled ? `오늘: ${day.name}` : `다음 세션: ${day.name}`}{' '}
              <span className="text-sm font-normal text-slate-400">· 약 {dayDurationMin(day)}분</span>
            </span>
          }
        >
          <ul className="space-y-3">
            {plan.map((p) => {
              const s = p.suggestion;
              return (
                <li key={p.exercise.id} className="rounded-xl bg-slate-950/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{p.exercise.name}</p>
                      <p className="text-sm text-slate-300 tabular-nums">
                        {s.weight === null ? '무게 찾기' : `${s.weight}kg`} × {s.repsTarget}회 × {s.sets}세트 · RIR {s.rir}
                        <span className="text-slate-500"> · 휴식 {Math.round((s.restSec / 60) * 10) / 10}분</span>
                      </p>
                    </div>
                    <Badge tone={s.action === 'increase_load' ? 'emerald' : s.action === 'decrease_load' || s.action === 'deload' ? 'amber' : 'slate'}>
                      {ACTION_LABEL[s.action]}
                    </Badge>
                  </div>
                  <WhyCard reasons={p.reasons} />
                </li>
              );
            })}
          </ul>
          {!open && (
            <Button className="mt-4 w-full py-3 text-base" onClick={startDay}>
              {restDay ? `그래도 오늘 운동하기 · ${day.name} 시작` : `${day.name} 시작`}
            </Button>
          )}
        </Card>
      )}

      <Card title="회복 중인 부위" right={<Button variant="subtle" onClick={() => go('recovery')}>전체</Button>}>
        {fatigued.length === 0 ? (
          <p className="text-sm text-slate-400">모든 부위가 90% 이상 회복됐습니다.</p>
        ) : (
          <ul className="space-y-2">
            {fatigued.slice(0, 5).map(([m, v]) => (
              <li key={m} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0">{MUSCLE_LABEL[m]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full ${recoveryTone(v)}`} style={{ width: `${v}%` }} />
                </div>
                <span className="w-10 text-right tabular-nums">{v}%</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <details className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-300">앱이 기록으로 루틴 자동 추천</summary>
        <div className="mt-3">
          <RecommendPanel initialWeekdays={program?.weekdays ?? []} />
        </div>
      </details>
    </div>
  );
}
