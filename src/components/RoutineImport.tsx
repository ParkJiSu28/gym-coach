import { useMemo, useState } from 'react';
import { saveActiveProgram } from '../data/db';
import { allExercises, getExercise } from '../domain/exercises';
import { VOLUME_LANDMARKS } from '../domain/research';
import { MUSCLES, MUSCLE_LABEL } from '../domain/types';
import { auditRoutine, parseRoutineText, routineToProgram, workingSets, type RoutineAudit, type RoutineDay } from '../engine/routineImport';
import { Badge, Button, Card, CitationChip } from './ui';

const KIND_LABEL = { remove: '빼기', sets: '세트', add: '추가', swap: '교체' } as const;
const exName = (id: string | null) => (id ? (getExercise(id)?.name ?? id) : '');

/** 메모에 적어 둔 루틴 글 → 인식 확인 → 논문 기준 점검 → 수정안(또는 원래대로) 적용 */
export function RoutineImport({ onApplied }: { onApplied?: () => void }) {
  const exercises = useMemo(() => [...allExercises()].sort((a, b) => a.name.localeCompare(b.name, 'ko')), []);
  const [text, setText] = useState('');
  const [days, setDays] = useState<RoutineDay[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const unmatched = days?.flatMap((d) => d.entries.filter((e) => !e.exerciseId)).length ?? 0;
  const audit: RoutineAudit | null = useMemo(() => (days && days.length ? auditRoutine(days) : null), [days]);

  function read() {
    const parsed = parseRoutineText(text);
    setMsg(parsed.length ? null : { ok: false, text: '종목과 "무게*횟수"를 찾지 못했습니다. 예) 벤치프레스 60*10 3세트' });
    setDays(parsed.length ? parsed : null);
  }

  function setExercise(di: number, ei: number, id: string) {
    setDays((ds) => ds!.map((d, i) => (i !== di ? d : { ...d, entries: d.entries.map((e, j) => (j === ei ? { ...e, exerciseId: id || null } : e)) })));
  }

  async function apply(revised: boolean) {
    if (!audit || !days) return;
    await saveActiveProgram(routineToProgram(revised ? audit.revised : days));
    setMsg({ ok: true, text: revised ? '수정안을 내 루틴으로 저장했습니다.' : '원래 루틴을 그대로 저장했습니다.' });
    onApplied?.();
  }

  return (
    <Card title="내 루틴 가져와서 점검">
      <p className="mb-2 text-sm text-slate-400">
        메모에 적어 둔 루틴을 그대로 붙여넣으세요. 루틴별 종목·세트를 읽고, 논문 기준으로 더하거나 뺄 운동과 다음 무게·횟수를 알려줍니다.
      </p>
      <textarea
        aria-label="루틴 글"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="상체A 루틴 (벤치프레스 50*8 5세트, 펙덱플라이 45*15,50*15,55*10 3세트, …) 하체A 루틴 (…)"
        className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-base outline-none focus:border-emerald-500"
      />
      <Button className="mt-2 w-full" onClick={read} disabled={!text.trim()}>
        읽고 점검하기
      </Button>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
          {msg.ok ? '✓ ' : ''}
          {msg.text}
        </p>
      )}

      {days && (
        <div className="mt-4 space-y-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold">① 읽은 내용 {unmatched > 0 && <Badge tone="amber">인식 못한 종목 {unmatched}개</Badge>}</h3>
            {days.map((d, di) => (
              <details key={d.name + di} className="mb-2 rounded-xl bg-slate-950/60 px-3 py-2" open={d.entries.some((e) => !e.exerciseId)}>
                <summary className="cursor-pointer text-sm font-medium">
                  {d.name} · {d.entries.length}종목
                </summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {d.entries.map((e, ei) => (
                    <li key={ei} className="flex flex-wrap items-center justify-between gap-1">
                      {e.exerciseId ? (
                        <span className="font-medium">{exName(e.exerciseId)}</span>
                      ) : (
                        <select aria-label={`${e.rawName} 종목 선택`} value="" onChange={(ev) => setExercise(di, ei, ev.target.value)} className="h-9 rounded-lg border border-amber-600 bg-slate-950 px-2 text-base">
                          <option value="">"{e.rawName}" → 종목 선택</option>
                          {exercises.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <span className="text-xs tabular-nums text-slate-400">
                        {e.sets.map((s) => `${s.weight}×${s.reps}`).join(', ')} · 본세트 {workingSets(e.sets).length}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </section>

          {audit && (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold">② 부위별 주간 세트 (워밍업 제외)</h3>
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="text-left font-normal">부위</th>
                      <th className="font-normal">지금</th>
                      <th className="font-normal">수정안</th>
                      <th className="font-normal">권장(MEV~MRV)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MUSCLES.filter((m) => audit.before[m] > 0 || audit.after[m] > 0).map((m) => {
                      const l = VOLUME_LANDMARKS[m];
                      const tone = (v: number) => (v > l.mrv ? 'text-rose-300' : v < l.mev ? 'text-amber-300' : 'text-emerald-300');
                      return (
                        <tr key={m} className="border-t border-slate-800">
                          <td className="py-1">{MUSCLE_LABEL[m]}</td>
                          <td className={`text-center ${tone(audit.before[m])}`}>{audit.before[m]}</td>
                          <td className={`text-center ${tone(audit.after[m])}`}>{audit.after[m]}</td>
                          <td className="text-center text-slate-500">
                            {l.mev}~{l.mrv}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">③ 수정안 ({audit.changes.length}개)</h3>
                {audit.changes.length === 0 && <p className="text-sm text-slate-400">고칠 곳이 없습니다.</p>}
                <ul className="space-y-2">
                  {audit.changes.map((c, i) => (
                    <li key={i} className="rounded-xl bg-slate-950/60 px-3 py-2 text-sm">
                      <p>
                        <Badge tone={c.kind === 'add' ? 'emerald' : c.kind === 'swap' ? 'sky' : 'amber'}>{KIND_LABEL[c.kind]}</Badge> <span className="text-slate-400">{c.day}</span>{' '}
                        <span className="font-medium">
                          {exName(c.exerciseId)}
                          {c.toExerciseId && ` → ${exName(c.toExerciseId)}`}
                          {c.kind === 'sets' && ` ${c.from}→${c.to}세트`}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{c.text}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.citations.map((id) => (
                          <CitationChip key={id} id={id} />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                {audit.notes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {audit.notes.map((n, i) => (
                      <li key={i} className="text-xs text-slate-400">
                        ※ {n.text} {n.citations.map((id) => <CitationChip key={id} id={id} />)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">④ 다음 운동 목표 (반복 범위 안에서 반복 → 무게 순으로 올리기)</h3>
                <ul className="space-y-1 text-sm">
                  {audit.targets.map((t, i) => (
                    <li key={i} className="flex justify-between gap-2 rounded-lg bg-slate-950/60 px-3 py-1.5">
                      <span className="min-w-0">
                        <span className="text-xs text-slate-500">{t.day}</span> {exName(t.exerciseId)}
                        <span className="block text-xs text-slate-400">{t.text}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {t.weight}kg × {t.reps}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex flex-wrap gap-1">
                  <CitationChip id="plotkin2022" />
                  <CitationChip id="schoenfeld2021continuum" />
                </div>
              </section>

              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => apply(false)}>
                  원래대로 적용
                </Button>
                <Button className="flex-1" onClick={() => apply(true)}>
                  수정안 적용
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
