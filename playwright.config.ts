import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// 이 PC에 설치된 Chrome 으로 모바일 뷰포트를 에뮬레이션해 핵심 사용자 흐름을 검증한다.
// (Playwright 가 Edge 를 띄우면 즉시 종료되는 문제가 있어 Chrome 실행 파일을 직접 지정)
const userChrome = join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe');
const browser = existsSync(userChrome) ? { launchOptions: { executablePath: userChrome } } : { channel: 'chrome' };
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'], ...browser } }],
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    // 이미 띄운 서버가 있으면 재사용 (npm run build && npm run preview:e2e)
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
