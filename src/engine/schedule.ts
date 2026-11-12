import type { Program, ProgramDay, SplitId } from '../domain/types';
import type { Reason } from './progression';
import { DAY_MS } from './volume';

/** 0=일 … 6=토 */
export const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 월요일 기준 정렬 순서 (월=0 … 일=6) */
const mondayIndex = (w: number) => (w + 6) % 7;

/** 중복·범위 밖 값을 제거하고 월요일부터 정렬 */
export function sortWeekdays(days: number[]): number[] {
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => mondayIndex(a) - mondayIndex(b));
}

export function formatWeekdays(days: number[]): string {
  return sortWeekdays(days)
    .map((d) => WEEKDAY_LABEL[d])
    .join('·');
}

/** 요일 → 그 요일에 할 day (요일 순서대로 day 를 배정) */
export function weekdayPlan(program: Pick<Program, 'weekdays' | 'days'>): { weekday: number; day: ProgramDay }[] {
  const wds = program.weekdays ?? [];
  if (program.days.length === 0) return [];
  return wds.map((weekday, i) => ({ weekday, day: program.days[i % program.days.length]! }));
}

/**
 * 해당 날짜의 예정 세션.
 * - undefined: 요일 일정이 없는 프로그램 (순환 방식)
 * - null: 휴식일
 */
export function scheduledDayFor(program: Pick<Program, 'weekdays' | 'days'>, date: number): ProgramDay | null | undefined {
  if (!program.weekdays || program.weekdays.length === 0) return undefined;
  const hit = weekdayPlan(program).find((x) => x.weekday === new Date(date).getDay());
  return hit ? hit.day : null;
}

/** from 날짜(포함)부터 다가오는 예정 세션 count 개 */
export function upcomingSessions(program: Pick<Program, 'weekdays' | 'days'>, from: number, count: number): { date: number; day: ProgramDay }[] {
  const out: { date: number; day: ProgramDay }[] = [];
  if (!program.weekdays?.length) return out;
  const start = new Date(from);
  start.setHours(12, 0, 0, 0);
  for (let i = 0; out.length < count && i < 7 * (count + 1); i++) {
    const date = start.getTime() + i * DAY_MS;
    const day = scheduledDayFor(program, date);
    if (day) out.push({ date, day });
  }
  return out;
}

/** 요일 배치에 대한 회복 관점 경고 */
export function scheduleWarnings(splitId: SplitId, weekdays: number[]): Reason[] {
  const days = sortWeekdays(weekdays);
  const set = new Set(days);
  const out: Reason[] = [];
  if (days.length >= 7) {
    out.push({
      text: '주 7일은 휴식일이 없습니다. 주 1일 이상 쉬어야 피로가 회복되고 수행이 유지됩니다.',
      citations: ['bell2023', 'app_fatigue_model'],
    });
  }
  if (splitId === 'full_body') {
    const pair = days.find((d) => set.has((d + 1) % 7));
    if (pair !== undefined) {
      out.push({
        text: `전신 운동을 연속으로(${WEEKDAY_LABEL[pair]}·${WEEKDAY_LABEL[(pair + 1) % 7]}) 하면 같은 근육이 48시간 안에 다시 자극됩니다. 가능하면 하루씩 띄우세요 — 앱이 회복도에 따라 세트를 자동으로 줄입니다.`,
        citations: ['schoenfeld2016freq', 'app_fatigue_model'],
      });
    }
  }
  return out;
}
