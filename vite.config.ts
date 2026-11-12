/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '근비대 코치 — 헬스 보조',
        short_name: '근비대 코치',
        description: '운동 기록 · 부위별 피로도 · 근거 기반 다음 세션 계획',
        lang: 'ko',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
    coverage: {
      include: ['src/engine/**'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
