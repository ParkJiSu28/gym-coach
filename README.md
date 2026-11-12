# 근비대 코치 💪

운동 기록 · 부위별 피로도 · 논문 기반 분석 · 다음 세션 처방을 한 번에 하는 헬스 보조 웹앱(PWA).
아이폰 Safari 에서 "홈 화면에 추가"하면 앱처럼 쓰고, 오프라인에서도 동작합니다. 기록은 기기 안에만 저장됩니다.

- 📖 **[사용설명서](docs/사용설명서.md)** — 아이폰 설치, 처음 시작하기, 운동하는 날, 처방 규칙
- 🧪 [TDD 증거 보고서](docs/tdd/record-based-recommendation.tdd.md)

## 개발

```bash
npm install
npm run dev        # 개발 서버
npm test           # 단위·통합 테스트 (Vitest)
npm run test:e2e   # E2E (Playwright, 설치된 Chrome 사용)
npm run build      # 배포용 빌드 → dist/
```

`master`/`main` 에 push 하면 GitHub Actions 가 테스트 → 빌드 → GitHub Pages 배포를 합니다.
