import { useMemo, useState } from 'react';
import { Badge, Button, Card, CitationChip, WhyCard } from '../components/ui';
import { db, saveActiveProgram } from '../data/db';
import { useActiveProgram, useNow } from '../data/hooks';
import { allExercises, getExercise } from '../domain/exercises';
import { VOLUME_LANDMARKS } from '../domain/research';
import { MUSCLES, MUSCLE_LABEL, type Muscle, type Program, type SplitId } from '../domain/types';
import { mesoPosition, recommendedRest } from '../engine/progression';
import { SPLIT_INFO, dayDurationMin, defaultRepRange, generateProgram, programWeeklyVolume, recommendSplit } from '../engine/splits';
import { volumeStatus } from '../engine/volume';

export function ProgramPage() {
  const program = useActiveProgram();
  const [creating, setCreating] = useState(false);

  if (program === undefined) return null;
  const showGenerator = creating || program === null;

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">루틴</h1>
        {program && !creating && (
          <Button variant="ghost" onClick={() => setCreating(true)}>
            새 루틴 만들기
          </Button>
        )}
      </header>
      {showGenerator ? (
        <Generator onDone={() => setCreating(false)} onCancel={program ? () => setCreating(false) : undefined} />
      ) : (
        program && <ProgramEditor program={program} />
      )}
    </div>
  );
}

// ─────────────────────────────── 루틴 생성기

function Generator({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [days, setDays] = useState(4);
  const [minutes, setMinutes] = useState(70);
  const [split, setSplit] = useState<SplitId | 'auto'>('auto');
  const [priorities, setPriorities] = useState<Muscle[]>([]);
  const [mesoWeeks, setMesoWeeks] = useState(4);

  const splitId = split === 'auto' ? recommendSplit(days) : split;
  const preview = useMemo(
    () => generateProgram({ daysPerWeek: days, sessionMinutes: minutes, priorities, splitId, mesoWeeks }),
    [days, minutes, priorities, splitId, mesoWeeks],
  );

  async function save() {
    await saveActiveProgram({ ...preview, createdAt: Date.now(), mesoStart: Date.now() });
    onDone();
  }

  const toggle = (m: Muscle) => setPriorities((p) => (p.includes(m) ? p.filter((x) => x !== m) : p.length >= 3 ? p : [...p, m]));

  return (
    <>
      <Card title="1. 운동 가능 시간">
        <p className="mb-2 text-sm text-slate-400">주당 운동 일수</p>
        <div className="grid grid-cols-5 gap-1">
          {[2, 3, 4, 5, 6].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`h-11 rounded-xl font-semibold ${days === d ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
            >
              {d}일
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm text-slate-400">
          세션당 시간: <b className="text-slate-100">{minutes}분</b>
          <input type="range" min={30} max={120} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="mt-2 w-full accent-emerald-500" />
        </label>
        <label className="mt-2 block text-sm text-slate-400">
          메소사이클 길이: <b className="text-slate-100">{mesoWeeks}주 + 디로딩 1주</b>
          <input type="range" min={3} max={7} value={mesoWeeks} onChange={(e) => setMesoWeeks(Number(e.target.value))} className="mt-2 w-full accent-emerald-500" />
        </label>
        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          4~8주마다 디로딩 권장 <CitationChip id="bell2023" />
        </p>
      </Card>

      <Card title="2. 분할법">
        <div className="space-y-2">
          <SplitOption id="auto" active={split === 'auto'} onSelect={() => setSplit('auto')} label={`자동 추천: ${SPLIT_INFO[recommendSplit(days)].name}`} />
          {(Object.keys(SPLIT_INFO) as SplitId[]).map((id) => (
            <SplitOption key={id} id={id} active={split === id} onSelect={() => setSplit(id)} days={days} />
          ))}
        </div>
      </Card>

      <Card title="3. 우선 부위 (최대 3개)">
        <p className="mb-2 text-sm text-slate-400">선택한 부위는 주간 볼륨을 최적 범위 하한 +2세트로 더 배정합니다.</p>
        <div className="flex flex-wrap gap-1.5">
          {MUSCLES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggle(m)}
              className={`rounded-full px-3 py-1.5 text-sm ${priorities.includes(m) ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
            >
              {MUSCLE_LABEL[m]}
            </button>
          ))}
        </div>
      </Card>

      <Card title={`미리보기 · ${preview.name}`}>
        <DayList program={preview} />
        <VolumeTable program={preview} daysPerWeek={days} />
        <div className="mt-4 flex gap-2">
          {onCancel && (
            <Button variant="ghost" className="flex-1" onClick={onCancel}>
              취소
            </Button>
          )}
          <Button className="flex-1 py-3" onClick={save}>
            이 루틴으로 시작
          </Button>
        </div>
      </Card>
    </>
  );
}

function SplitOption({ id, active, onSelect, label, days }: { id: SplitId | 'auto'; active: boolean; onSelect: () => void; label?: string; days?: number }) {
  if (id === 'auto') {
    return (
      <button type="button" onClick={onSelect} className={`w-full rounded-xl border p-3 text-left ${active ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-800'}`}>
        <span className="font-semibold">{label}</span>
      </button>
    );
  }
  const info = SPLIT_INFO[id];
  const fits = days !== undefined && info.days.includes(days);
  return (
    <details className={`rounded-xl border ${active ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-800'}`}>
      <summary className="flex items-center justify-between gap-2 p-3" onClick={onSelect}>
        <span className="font-semibold">{info.name}</span>
        <span className="flex gap-1">
          <Badge tone={info.frequency.includes('1회') ? 'amber' : 'emerald'}>{info.frequency}</Badge>
          {fits && <Badge tone="sky">주 {days}일 적합</Badge>}
        </span>
      </summary>
      <div className="grid grid-cols-2 gap-3 px-3 pb-3 text-sm">
        <ul className="space-y-1 text-emerald-300">
          {info.pros.map((p) => (
            <li key={p}>+ {p}</li>
          ))}
        </ul>
        <ul className="space-y-1 text-amber-300">
          {info.cons.map((c) => (
            <li key={c}>− {c}</li>
          ))}
        </ul>
        <div className="col-span-2">
          <WhyCard reasons={info.reasons} />
        </div>
      </div>
    </details>
  );
}

function DayList({ program, editable = false, onChange }: { program: Program; editable?: boolean; onChange?: (p: Program) => void }) {
  const update = (fn: (p: Program) => void) => {
    const next: Program = structuredClone(program);
    fn(next);
    onChange?.(next);
  };
  return (
    <div className="space-y-3">
      {program.days.map((d, di) => (
        <div key={d.id} className="rounded-xl bg-slate-950/50 p-3">
          <p className="mb-2 flex justify-between font-semibold">
            <span>{d.name}</span>
            <span className="text-sm font-normal text-slate-400">약 {dayDurationMin(d)}분</span>
          </p>
          <ul className="space-y-1.5 text-sm">
            {d.exercises.map((pe, ei) => (
              <li key={`${pe.exerciseId}-${ei}`} className="flex items-center justify-between gap-2">
                <span className="flex-1">{getExercise(pe.exerciseId)?.name ?? pe.exerciseId}</span>
                {editable ? (
                  <span className="flex items-center gap-1 tabular-nums">
                    <button type="button" aria-label="세트 감소" className="h-7 w-7 rounded bg-slate-800" onClick={() => update((p) => void (p.days[di]!.exercises[ei]!.sets = Math.max(1, pe.sets - 1)))}>
                      −
                    </button>
                    <span className="w-10 text-center">{pe.sets}세트</span>
                    <button type="button" aria-label="세트 증가" className="h-7 w-7 rounded bg-slate-800" onClick={() => update((p) => void (p.days[di]!.exercises[ei]!.sets = Math.min(8, pe.sets + 1)))}>
                      +
                    </button>
                    <span className="w-14 text-right text-slate-400">
                      {pe.repMin}~{pe.repMax}회
                    </span>
                    <button type="button" aria-label="종목 삭제" className="h-7 w-7 text-slate-500 hover:text-rose-400" onClick={() => update((p) => void p.days[di]!.exercises.splice(ei, 1))}>
                      ✕
                    </button>
                  </span>
                ) : (
                  <span className="text-slate-400 tabular-nums">
                    {pe.sets}세트 × {pe.repMin}~{pe.repMax}회
                  </span>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <select
              value=""
              onChange={(e) => {
                const ex = getExercise(e.target.value);
                if (!ex) return;
                const [repMin, repMax] = defaultRepRange(ex);
                update((p) => void p.days[di]!.exercises.push({ exerciseId: ex.id, sets: 3, repMin, repMax, restSec: recommendedRest(ex) }));
              }}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-400"
            >
              <option value="">+ 종목 추가</option>
              {allExercises().map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}

function VolumeTable({ program, daysPerWeek }: { program: Program; daysPerWeek: number }) {
  const vol = programWeeklyVolume(program.days, daysPerWeek);
  return (
    <details className="mt-3 rounded-xl border border-slate-800 p-3">
      <summary className="text-sm font-semibold">주간 계획 볼륨 (부위별 환산 세트) ▾</summary>
      <table className="mt-2 w-full text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="text-left font-normal">부위</th>
            <th className="text-right font-normal">계획</th>
            <th className="text-right font-normal">최적 범위</th>
          </tr>
        </thead>
        <tbody>
          {MUSCLES.map((m) => {
            const st = volumeStatus(m, vol[m]);
            return (
              <tr key={m} className="border-t border-slate-800/60">
                <td className="py-1">{MUSCLE_LABEL[m]}</td>
                <td className={`text-right tabular-nums ${st === 'optimal' ? 'text-emerald-300' : st === 'below_mev' || st === 'over_mrv' ? 'text-rose-300' : 'text-amber-300'}`}>{vol[m]}</td>
                <td className="text-right text-slate-500 tabular-nums">
                  {VOLUME_LANDMARKS[m].mavLow}~{VOLUME_LANDMARKS[m].mavHigh}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        메소사이클 1주차는 MEV~최적 하한에서 시작하고, 회복이 좋으면 매주 세트를 늘립니다.
        <CitationChip id="schoenfeld2017volume" />
        <CitationChip id="israetel_landmarks" />
      </p>
    </details>
  );
}

// ─────────────────────────────── 활성 루틴 편집

function ProgramEditor({ program }: { program: Program }) {
  const now = useNow(60_000);
  const meso = mesoPosition(program, now);
  const [draft, setDraft] = useState<Program | null>(null);
  const shown = draft ?? program;

  async function saveDraft() {
    if (!draft || !program.id) return;
    await db.programs.update(program.id, { days: draft.days });
    setDraft(null);
  }

  async function restartMeso() {
    if (!program.id || !window.confirm('메소사이클을 1주차부터 다시 시작할까요?')) return;
    await db.programs.update(program.id, { mesoStart: Date.now() });
  }

  return (
    <>
      <Card title={program.name}>
        <div className="flex flex-wrap gap-2">
          <Badge tone={meso.isDeload ? 'sky' : 'emerald'}>{meso.isDeload ? '디로딩 주' : `${meso.week}/${meso.totalWeeks}주차`}</Badge>
          <Badge>사이클 {meso.cycle}</Badge>
          {program.priorities.length > 0 && <Badge tone="amber">우선: {program.priorities.map((m) => MUSCLE_LABEL[m]).join(', ')}</Badge>}
        </div>
        <Button variant="subtle" className="mt-3 w-full" onClick={restartMeso}>
          메소사이클 처음부터
        </Button>
      </Card>
      <Card title="구성 편집">
        <DayList program={shown} editable onChange={setDraft} />
        <VolumeTable program={shown} daysPerWeek={shown.days.length} />
        {draft && (
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setDraft(null)}>
              되돌리기
            </Button>
            <Button className="flex-1" onClick={saveDraft}>
              변경 저장
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
