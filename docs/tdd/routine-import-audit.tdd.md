# TDD 증거: 메모 루틴 가져오기 + 논문 기준 점검

- 출처: 사용자 요청 "응 그렇게 만들어서 배포해줘"(운동기록.txt 형식 루틴 → 종목별 세트 저장 → 논문 기준 추가/삭제/무게·횟수 수정안)
- 여정: 사용자는 메모의 한 줄 루틴을 붙여넣어 루틴별 종목·세트를 확인하고, 근거가 붙은 수정안과 다음 목표를 본 뒤 적용한다.

| 단계 | 커밋 | 명령 | 결과 |
|---|---|---|---|
| RED | a84dfca | `npx vitest run src/engine/routineImport.test.ts` | `Cannot find module './routineImport'` (컴파일 단계 RED) |
| GREEN | (이 커밋) | `npm test` / `npx playwright test --workers=2` | 224/224, E2E 20/20 |

| # | 보장 | 테스트 |
|---|---|---|
| 1 | 사용자 실제 글(fixture)을 상체A·하체A·상체B·하체B 로 나누고 모든 종목 인식 | routineImport.test.ts parseRoutineText |
| 2 | 세트별 무게×반복, "N세트" 채우기, 쉼표 없는 연결, `57.5,8` 오타 | 〃 |
| 3 | 워밍업(최고 무게 60% 미만) 제외 | workingSets |
| 4 | 더블 프로그레션 다음 목표(증량/반복+1/감량) | nextTarget |
| 5 | MRV 초과 → 중복 동작 빼기·고립 세트 줄이기, 복합 하체 운동은 줄이지 않음 | auditRoutine |
| 6 | 라잉→시티드 레그컬 교체 (Maeo 2021), MEV 미만 → 세트 추가, 모든 변경에 근거 | auditRoutine |
| 7 | 앱 루틴(Program) 변환, 볼륨 일치 | routineToProgram |
| 8 | 붙여넣기 → 수정안·근거·목표 표시 → 적용 → 오늘 탭 반영 | e2e J7 |

알려진 한계: 랜드마크(MEV/MRV)는 전문가 의견(Israetel) 기반 추정치. 내전근은 별도 부위가 없어 둔근 0.5 로 계산. 가져온 루틴은 날짜가 없어 기록으로 저장하지 않음.

## 2차: 목표 무게 · 기록 저장 · 같은 부위 날 배분 · 밝은 화면

요청: "루틴분석하면 기록으로 저장하기도 기능이 필요하고 … 하체가 2번인데 너무 1번에 쏠려있다 이러면 … 배분 … 화면은 좀 밝게"

| 단계 | 커밋 | 결과 |
|---|---|---|
| RED | e19b109 | 9 실패 (saveRoutineRecords 없음, startWeight 무시, targetWeight 없음, move 없음) |
| RED | (작업 중) | 어시스트 머신 방향 2 실패 |
| GREEN | (이 커밋) | vitest 237/237, playwright 20/20 |

| 보장 | 테스트 |
|---|---|
| Program 에 targetWeight/targetReps, 추가 종목은 없음 | routineImport.test.ts |
| 기록이 없으면 targetWeight 로 첫 처방 | engine.test.ts suggestNext |
| 같은 부위 날 사이 4세트 이상 쏠림 → 종목 옮기기(근거 포함), 상체↔하체는 안 옮김 | routineImport.test.ts |
| 루틴 → 날짜별 기록 (본세트만, RIR 추정, 미래 날짜 거부, 빈 날짜 건너뜀) | data/routineRecords.test.ts |
| 어시스트 머신 증감 방향 반대 | routineImport.test.ts |
| 기록 저장·목표 무게 표시 E2E | e2e J7 |

## 3차: 운동 시간 제한 · 반복 범위 점검

요청: "70분으로 줄이고 싶다고하면 그에 맞게 조정 … 오버하거나 불필요하게 많이 … 논문에 맞는 근비대 횟수"

| 단계 | 커밋 | 결과 |
|---|---|---|
| RED | f224adf | 6 실패 (durations 없음, maxMinutes 무시, 반복 범위 알림 없음) |
| GREEN | (이 커밋) | vitest 245/245, playwright 20/20 |

보장: 70분 제한 시 4개 루틴 모두 70분 이하, MEV 유지, 변경마다 "70분" 이유와 근거. 실행 불가능한 시간(15분)은 알림. 20회 초과·5회 미만 본세트 알림. E2E J7 에서 시간 제한 입력 → "30분 맞추기" 수정안 표시.
