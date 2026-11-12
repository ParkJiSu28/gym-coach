import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { loadCustomExercises } from './data/db';

registerSW({ immediate: true });

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
