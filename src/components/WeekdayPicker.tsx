import type { Dispatch, SetStateAction } from 'react';
import { sortWeekdays, WEEKDAY_LABEL } from '../engine/schedule';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** 운동 가능 요일 선택 (최대 6일). 빠르게 연속으로 눌러도 누락되지 않도록 함수형 업데이트 사용 */
export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: Dispatch<SetStateAction<number[]>> }) {
  const toggle = (d: number) =>
    onChange((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : prev.length < 6 ? sortWeekdays([...prev, d]) : prev));
  return (
    <div role="group" aria-label="운동 가능 요일" className="grid grid-cols-7 gap-1">
      {ORDER.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(d)}
            className={`h-10 rounded-lg text-sm font-semibold ${on ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'} ${d === 0 ? 'text-rose-300' : ''}`}
          >
            {WEEKDAY_LABEL[d]}
          </button>
        );
      })}
    </div>
  );
}
