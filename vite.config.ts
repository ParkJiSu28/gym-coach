/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 상대 경로: GitHub Pages 처럼 하위 경로(/저장소이름/)에 배포해도 동작 (화면 이동은 # 해시 방식)
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: '근비대 코치 — 헬스 보조',
        short_name: '근비대 코치',
        description: '운동 기록 · 부위별 피로도 · 근거 기반 다음 세션 계획',
        lang: 'ko',
        theme_color: '#ffffff',
        background_color: '#eef2f6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
    coverage: {
      include: ['src/engine/**', 'src/data/db.ts', 'src/data/transfer.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
