import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { Checkin, Program, SetLog, WorkoutSession } from '../domain/types';
import { db } from './db';

const EMPTY_SETS: SetLog[] = [];
const EMPTY_SESSIONS: WorkoutSession[] = [];
const EMPTY_CHECKINS: Checkin[] = [];

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * 분석용 기준 시각: 분 단위 틱(useNow)과 마지막 세트 완료 시각 중 늦은 쪽.
 * 틱 사이에 방금 기록한 세트가 "미래"로 취급돼 빠지는 것을 막는다.
 */
export function useAnalysisNow(sets: SetLog[], intervalMs = 60_000): number {
  const now = useNow(intervalMs);
  return Math.max(now, sets.at(-1)?.completedAt ?? 0);
}

export function useAllSets(): SetLog[] {
  return useLiveQuery(() => db.sets.orderBy('completedAt').toArray(), [], EMPTY_SETS);
}

export function useSessions(): WorkoutSession[] {
  return useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), [], EMPTY_SESSIONS);
}

export function useCheckins(): Checkin[] {
  return useLiveQuery(() => db.checkins.orderBy('date').reverse().toArray(), [], EMPTY_CHECKINS);
}

/** undefined = 로딩 중, null = 활성 프로그램 없음 */
export function useActiveProgram(): Program | null | undefined {
  return useLiveQuery(async () => (await db.programs.filter((p) => p.active).first()) ?? null, []);
}

/** undefined = 로딩 중, null = 진행 중인 세션 없음 */
export function useOpenSession(): WorkoutSession | null | undefined {
  return useLiveQuery(async () => (await db.sessions.filter((s) => !s.endedAt).first()) ?? null, []);
}
