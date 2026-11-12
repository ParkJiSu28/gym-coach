# TDD 증거 보고서 — 기록 기반 추천 · 직접 입력 · 운동 중 변경 · iOS

- **브랜치**: `feat/record-based-recommendation`
- **원본 계획**: 대화 중 합의한 보완 계획(요구사항 대조표 1~9번) + 추가 요구(근비대 중심, 운동 가능 요일). 별도 `*.plan.md` 없음.
- **테스트 러너**: Vitest 3.2 (`npm test`), Playwright 1.64 (`npm run test:e2e`, 이 PC의 Chrome · Pixel 7 에뮬레이션)

## 사용자 여정

| # | 여정 |
|---|---|
| J1 | 다른 앱 기록을 날짜·세트별로 손으로 입력한다 (RIR 은 모르면 "모름") |
| J2 | 버튼 하나("내 기록으로 루틴 추천")로 분할·요일·종목·세트·무게·반복·휴식을 받는다. 운동 가능 요일을 바꾸면 프로그램이 다시 짜인다 |
| J3 | 루틴 생성 → 세트 기록 → 종료 → 다음 처방 자동 반영 (기존 흐름 회귀 방지) |
| J4 | 운동 중 종목 교체(벤치 → 스미스 벤치), 기록한 세트 수정, 휴식 타이머 조절, RIR 모름 |
| J5 | 부위별 논문 기준 분석 리포트 |
| iOS | 홈 화면 설치 메타·PNG 아이콘, 입력창 16px 이상 |

## 체크포인트 커밋

| 단계 | 커밋 | 증거 |
|---|---|---|
| 기준선 | `d8439d8` | 기존 52개 단위 테스트 통과 |
| RED | `e629949` | vitest: 7개 파일 모듈 없음(compile-time RED) + 5개 단언 실패(runtime RED), 기존 50개 통과 · playwright: **14 failed / 1 passed** |
| GREEN | `4416208` | vitest **156/156** · 커버리지 lines 98.6% / branches 96.5% / functions 98.8% · playwright **15/15** |
| 버그 수정 (RED→GREEN) | `0f8fd63` | RED: `inferWeekdays` 화요일 기록 1건·n=2 → `[월,화]` 연속 재현 / GREEN: vitest 157/157, playwright 15/15 |

## 테스트 명세 (무엇이 보장되는가)

| # | 보장 내용 | 테스트 | 유형 | 결과 |
|---|---|---|---|---|
| 1 | 세트마다 다른 무게·반복 보존, RIR 모름 → 2(추정 표시) | `records.test.ts` | unit | PASS |
| 2 | 미래 날짜·잘못된 무게/반복/RIR/세트 수 거부, 몇 번째 세트인지 안내 | `records.test.ts` | unit | PASS |
| 3 | 직접 입력은 같은 날짜끼리 manual 세션으로 묶이고 휴식 시간 없음, 라이브 세션과 분리 | `db.test.ts › addManualEntry` | integration | PASS |
| 4 | 세트 수정(RIR 입력 시 추정 해제), 잘못된 값 거부 | `db.test.ts › updateSet` | integration | PASS |
| 5 | 운동 중 교체 내역 저장·덮어쓰기·되돌리기 | `db.test.ts › swapExercise` | integration | PASS |
| 6 | 최근 4주 운동 일수·요일·세션 시간·부족 부위 추론 | `recommend.test.ts` | unit | PASS |
| 7 | 템플릿 종목을 "내가 하던" 같은 주동근·같은 유형 종목으로 교체(중복·불변성 포함) | `recommend.test.ts › personalizeProgram` | unit | PASS |
| 8 | 원버튼 추천: 기록 없음 안내, 기록 기반 증량 처방, 사용자 지정값 우선, 요일 지정 → 요일 수만큼 day | `recommend.test.ts › recommendFromRecords` | unit | PASS |
| 9 | 요일 → day 배정, 오늘 세션/휴식일, 다가오는 세션, 연속 전신·주 7일 경고 | `schedule.test.ts` | unit | PASS |
| 10 | 대체 종목은 같은 주동근, 벤치 → 스미스 벤치 상위, 루틴 반영 시 세트 수 유지 | `swap.test.ts` | unit | PASS |
| 11 | 리포트: 부족/최적/과다 부위별 할 일 + 논문, 빈도·저반복·짧은 휴식·RIR 미기록·단일 종목·라잉 레그컬 팁 | `report.test.ts` | unit | PASS |
| 12 | 타이머 남은 시간·진행률, ±15초(30초~10분 제한) | `timer.test.ts` | unit | PASS |
| 13 | RIR 추정 기록으로는 "실패에 너무 가까움 → 유지" 규칙 미적용 | `engine.test.ts` | unit | PASS |
| 14 | 근비대 반복 범위(바벨 복합 6~10, 머신/덤벨 복합 8~12, 고립 10~15, 소근육 12~20), 시티드 레그 컬 우선 | `engine.test.ts` | unit | PASS |
| 15 | J1~J5 · iOS 사용자 흐름 | `e2e/app.spec.ts` (15개) | E2E | PASS |

## 실행 명령 (실제 실행한 것)

```bash
npx vitest run                          # 157 passed
npx vitest run --coverage               # lines 98.6%, branches 96.5%
npx playwright test --workers=4         # 15 passed (7.8s)
```

## 알려진 한계 · 미검증

- 실제 iPhone Safari 기기 테스트는 하지 않음 (Chrome 모바일 에뮬레이션으로 대체). 소리 알림·화면 꺼짐 방지·홈 화면 설치는 배포 후 실기기 확인 필요.
- 화면이 꺼진 상태의 타이머 알림은 iOS 웹앱 제약상 불가.
- 논문 DOI 는 공개 서지 정보 기준으로 기재 — 원문 확인 권장. 피로도 모델은 검증된 모델이 아닌 추정치.
- 환경 이슈: Playwright 1.52 는 Node 26 에서 설정 로딩 중 멈춤 → 1.64 로 업그레이드. 이 PC에서 Playwright 가 Edge 를 띄우면 즉시 종료되어 Chrome 실행 파일을 직접 지정.
