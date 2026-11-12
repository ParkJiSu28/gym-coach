import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { loadCustomExercises } from './data/db';

registerSW({ immediate: true });

// iOS Safari 는 오래 안 쓴 사이트의 저장소를 지울 수 있다 → 영구 보존 요청 (홈 화면 앱이면 대부분 허용)
void navigator.storage?.persist?.().catch(() => undefined);

const root = createRoot(document.getElementById('root')!);

loadCustomExercises()
  .catch((err: unknown) => console.error('사용자 정의 운동 로드 실패', err))
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
