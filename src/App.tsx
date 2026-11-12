import { lazy, Suspense, useEffect, useState } from 'react';
import { useOpenSession } from './data/hooks';
import { GuidePage } from './pages/GuidePage';
import { LogPage } from './pages/LogPage';
import { ProgramPage } from './pages/ProgramPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { TodayPage } from './pages/TodayPage';

// 차트 라이브러리(recharts)가 커서 분석 탭은 지연 로드
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })));

export type Tab = 'today' | 'log' | 'recovery' | 'stats' | 'program' | 'guide';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: '오늘', icon: '☀' },
  { id: 'log', label: '기록', icon: '✎' },
  { id: 'recovery', label: '회복', icon: '♥' },
  { id: 'stats', label: '분석', icon: '▤' },
  { id: 'program', label: '루틴', icon: '▦' },
  { id: 'guide', label: '가이드', icon: '?' },
];

function readHash(): Tab {
  const h = window.location.hash.replace('#', '') as Tab;
  return TABS.some((t) => t.id === h) ? h : 'today';
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readHash);
  const open = useOpenSession();

  useEffect(() => {
    const onHash = () => setTab(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    if (t !== tab) window.location.hash = t;
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <main className="flex-1 px-4 pt-4 pb-28">
        {tab === 'today' && <TodayPage go={go} />}
        {tab === 'log' && <LogPage go={go} />}
        {tab === 'recovery' && <RecoveryPage />}
        {tab === 'stats' && (
          <Suspense fallback={<p className="text-sm text-slate-400">불러오는 중…</p>}>
            <StatsPage />
          </Suspense>
        )}
        {tab === 'program' && <ProgramPage />}
        {tab === 'guide' && <GuidePage />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="mx-auto grid max-w-xl grid-cols-6">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => go(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`relative flex w-full flex-col items-center gap-0.5 py-2.5 text-xs ${tab === t.id ? 'text-emerald-300' : 'text-slate-400'}`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
                {t.id === 'log' && open && <span className="absolute top-1.5 right-1/4 h-2 w-2 rounded-full bg-emerald-400" aria-label="진행 중인 운동" />}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
