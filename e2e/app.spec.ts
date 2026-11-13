import { expect, test, type Page } from '@playwright/test';

/** 오늘 기준 n일 전 로컬 날짜 (YYYY-MM-DD) */
function localDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const nav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
const card = (page: Page, heading: string | RegExp) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) });

async function createProgram(page: Page, days: number) {
  await page.goto('/#program');
  await page.getByRole('button', { name: `${days}일`, exact: true }).click();
  await page.getByRole('button', { name: '이 루틴으로 시작' }).click();
  await expect(page.getByRole('button', { name: '새 루틴 만들기' })).toBeVisible();
}

/** 지난 기록 직접 입력: sets = [[무게, 반복], ...] */
async function addManualRecord(page: Page, r: { daysAgo: number; exercise: string; sets: [number, number][] }) {
  const form = card(page, '지난 기록 직접 입력');
  await form.getByLabel('날짜').fill(localDate(r.daysAgo));
  await form.getByRole('combobox', { name: '운동' }).selectOption({ label: r.exercise });
  for (let i = 0; i < r.sets.length; i++) {
    if (i > 0) await form.getByRole('button', { name: '세트 추가' }).click();
    await form.getByRole('spinbutton', { name: `${i + 1}세트 무게` }).fill(String(r.sets[i]![0]));
    await form.getByRole('spinbutton', { name: `${i + 1}세트 반복` }).fill(String(r.sets[i]![1]));
  }
  await form.getByRole('button', { name: '기록 저장' }).click();
}

async function startUpperA(page: Page) {
  await createProgram(page, 4);
  await nav(page, '오늘');
  await page.getByRole('button', { name: /상체 A 시작/ }).click();
}

async function logSet(page: Page, exercise: string, weight: number, reps: number, rir = '2') {
  const c = card(page, exercise);
  await c.getByRole('spinbutton', { name: '무게' }).fill(String(weight));
  await c.getByRole('spinbutton', { name: '반복' }).fill(String(reps));
  await c.getByRole('button', { name: rir, exact: true }).click();
  await c.getByRole('button', { name: /세트 완료/ }).click();
}

test.describe('J3 — 기존 핵심 흐름', () => {
  test('루틴을 만들면 오늘 탭에 다음 세션 처방이 보인다', async ({ page }) => {
    await createProgram(page, 4);
    await nav(page, '오늘');
    await expect(page.getByRole('heading', { name: /상체 A/ })).toBeVisible();
    await expect(page.getByText('바벨 벤치프레스').first()).toBeVisible();
    await expect(page.getByText('기준점 측정').first()).toBeVisible();
  });

  test('세트를 기록하고 종료하면 다음 세션에 증량이 처방된다', async ({ page }) => {
    await startUpperA(page);
    await logSet(page, '바벨 벤치프레스', 60, 10);
    await logSet(page, '바벨 벤치프레스', 60, 10);
    await expect(card(page, '바벨 벤치프레스').getByText('2/5세트')).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible();
    await page.getByRole('button', { name: '운동 종료' }).click();

    await nav(page, '기록');
    await page.getByRole('button', { name: '상체 A', exact: true }).click();
    const next = card(page, '바벨 벤치프레스');
    await expect(next.getByText('증량')).toBeVisible();
    await expect(next.getByText(/목표 62\.5kg × 6회/)).toBeVisible();
  });
});

test.describe('J1 — 측정치 직접 입력', () => {
  test('세트마다 다른 무게·반복을 입력하면 목록과 분석에 반영된다', async ({ page }) => {
    await page.goto('/#log');
    await addManualRecord(page, { daysAgo: 3, exercise: '바벨 벤치프레스', sets: [[80, 8], [80, 7], [75, 8]] });
    await expect(page.getByRole('status')).toContainText('바벨 벤치프레스 3세트 저장됨');

    const list = card(page, '직접 입력한 기록');
    await expect(list.getByText(/바벨 벤치프레스/)).toBeVisible();
    await expect(list.getByText('80×8, 80×7, 75×8')).toBeVisible();

    await nav(page, '분석');
    await expect(card(page, '운동 이력').getByText(/3세트/)).toBeVisible();
  });

  test('날짜·운동 칸이 겹치지 않게 각각 한 줄 전체 너비로 배치된다 (iOS 날짜 칸 확장 대응)', async ({ page }) => {
    await page.goto('/#log');
    const form = card(page, '지난 기록 직접 입력');
    const date = (await form.getByLabel('날짜').boundingBox())!;
    const ex = (await form.getByRole('combobox', { name: '운동' }).boundingBox())!;
    const box = (await form.boundingBox())!;
    // 위아래로 쌓임 (겹침 없음)
    expect(date.y + date.height).toBeLessThanOrEqual(ex.y);
    // 각 칸이 카드 안쪽 폭을 거의 다 사용 (나란히 두지 않음)
    for (const b of [date, ex]) {
      expect(b.width).toBeGreaterThan(box.width * 0.8);
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width);
    }
  });

  test('캡처 글자를 붙여넣으면 종목·세트를 인식하고, 확인 후 저장한다', async ({ page }) => {
    const pasted = [
      '5:554', '•ll 5G', '100)', '저장', 'AD DramaBox | INSTALL', '하체b(햄/둔)', ':', '+ 웜업 스트레칭', 'PRO',
      '힙 쓰러스트 머신', ':', '메모...', '-', '세트', '+', '불러오기',
      '1', '40 kg', '10회', '2', '40 kg', '10회', '3', '40 kg', '10회',
      '데드리프트', '仁', '+ 종목 추가', '메모...', '아침 저녁', '여유', '언제 어디서든 즐거움이 가득', 'BIGO LIVE',
    ].join('\n');
    await page.goto('/#log');
    const imp = card(page, '캡처 글자로 가져오기');
    await imp.getByLabel('복사한 글자 붙여넣기').fill(pasted);
    await imp.getByRole('button', { name: '분석' }).click();

    await expect(imp.getByText('하체b(햄/둔)', { exact: true })).toBeVisible();
    const hip = imp.getByRole('group', { name: '힙 쓰러스트 머신' });
    await expect(hip.getByRole('combobox', { name: '종목' })).toHaveValue('machine_hip_thrust');
    await expect(hip.getByText('40×10, 40×10, 40×10')).toBeVisible();
    await expect(imp.getByRole('group', { name: '데드리프트' }).getByText(/세트 없음/)).toBeVisible();

    await imp.getByLabel('운동한 날짜').fill(localDate(4));
    await imp.getByRole('button', { name: /1개 종목 저장/ }).click();
    await expect(imp.getByRole('status')).toContainText('1개 종목 · 3세트 저장됨');
    await expect(card(page, '직접 입력한 기록').getByText('힙 쓰러스트 머신')).toBeVisible();
  });

  test('미래 날짜는 저장되지 않고 오류를 보여준다', async ({ page }) => {
    await page.goto('/#log');
    await addManualRecord(page, { daysAgo: -2, exercise: '바벨 벤치프레스', sets: [[80, 8]] });
    await expect(page.getByRole('alert')).toContainText('미래');
    await expect(card(page, '직접 입력한 기록')).toHaveCount(0);
  });

  test('직접 입력한 기록을 삭제할 수 있다', async ({ page }) => {
    await page.goto('/#log');
    await addManualRecord(page, { daysAgo: 1, exercise: '바벨 백스쿼트', sets: [[100, 5], [100, 5]] });
    const list = card(page, '직접 입력한 기록');
    await expect(list.getByText(/바벨 백스쿼트/)).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await list.getByRole('button', { name: /삭제/ }).first().click();
    await expect(card(page, '직접 입력한 기록')).toHaveCount(0);
  });
});

test.describe('J2 — 버튼 하나로 기록 기반 루틴 추천', () => {
  test('기록이 없으면 기본 루틴과 안내를 보여준다', async ({ page }) => {
    await page.goto('/#today');
    await page.getByRole('button', { name: '내 기록으로 루틴 추천' }).click();
    const result = card(page, '추천 결과');
    await expect(result).toBeVisible();
    await expect(result.getByText(/기록이 없/)).toBeVisible();
  });

  test('입력한 기록으로 루틴·무게·횟수·세트·휴식을 한 번에 추천하고 적용한다', async ({ page }) => {
    await page.goto('/#log');
    await addManualRecord(page, { daysAgo: 3, exercise: '바벨 벤치프레스', sets: [[80, 8], [80, 8], [80, 8]] });
    await addManualRecord(page, { daysAgo: 3, exercise: '바벨 백스쿼트', sets: [[100, 10], [100, 10], [100, 10]] });

    await nav(page, '오늘');
    await page.getByRole('button', { name: '내 기록으로 루틴 추천' }).click();
    const result = card(page, '추천 결과');
    await expect(result).toBeVisible();
    // 벤치 80kg × 8회(범위 안) → 같은 무게로 9회
    await expect(result.getByText(/80kg × 9회/).first()).toBeVisible();
    // 스쿼트 100kg × 10회(상한) → 증량 (+1단위 이상, 최대 +10%)
    await expect(result.getByText(/(102\.5|105|107\.5|110)kg × 6회/).first()).toBeVisible();
    await expect(result.getByText(/휴식 2\.5분/).first()).toBeVisible();

    await result.getByRole('button', { name: '이 루틴 적용' }).click();
    await expect(card(page, '추천 결과')).toHaveCount(0);
    await nav(page, '루틴');
    await expect(page.getByText('바벨 벤치프레스').first()).toBeVisible();
  });

  test('운동 가능 요일을 고르면 그 요일에 맞춰 프로그램이 바뀐다', async ({ page }) => {
    await page.goto('/#today');
    const picker = page.getByRole('group', { name: '운동 가능 요일' });
    for (const d of ['월', '수', '금']) await picker.getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('button', { name: '내 기록으로 루틴 추천' }).click();
    const result = card(page, '추천 결과');
    await expect(result.getByText(/월·수·금/).first()).toBeVisible();
    await result.getByRole('button', { name: '이 루틴 적용' }).click();

    await nav(page, '루틴');
    const schedule = card(page, '주간 일정');
    await expect(schedule.getByText('월 · 전신 A')).toBeVisible();
    await expect(schedule.getByText('수 · 전신 B')).toBeVisible();
    await expect(schedule.getByText('금 · 전신 C')).toBeVisible();

    // 요일 변경 → 프로그램 재구성
    const edit = page.getByRole('group', { name: '운동 가능 요일' });
    await edit.getByRole('button', { name: '목', exact: true }).click();
    await page.getByRole('button', { name: '요일 변경 적용' }).click();
    await expect(card(page, '주간 일정').getByText(/목 · /)).toBeVisible();
    await expect(card(page, '주간 일정').getByText(/상체|하체/).first()).toBeVisible();
  });
});

test.describe('J4 — 운동 중 자유로운 변경', () => {
  test('벤치프레스를 스미스 벤치프레스로 바꾸고 루틴에도 반영한다', async ({ page }) => {
    await startUpperA(page);
    await card(page, '바벨 벤치프레스').getByRole('button', { name: '교체' }).click();
    const picker = card(page, '종목 교체');
    await picker.getByRole('button', { name: /스미스 벤치프레스/ }).click();
    await picker.getByRole('button', { name: '루틴에도 반영' }).click();

    await expect(page.getByRole('heading', { name: '스미스 벤치프레스' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '바벨 벤치프레스' })).toHaveCount(0);

    await nav(page, '루틴');
    await expect(page.getByText('스미스 벤치프레스').first()).toBeVisible();
  });

  test('기록한 세트를 수정할 수 있다', async ({ page }) => {
    await startUpperA(page);
    await logSet(page, '바벨 벤치프레스', 60, 10);
    const bench = card(page, '바벨 벤치프레스');
    await bench.getByRole('button', { name: '1세트 수정' }).click();
    await bench.getByRole('spinbutton', { name: '수정 반복' }).fill('8');
    await bench.getByRole('button', { name: '수정 저장' }).click();
    await expect(bench.getByText(/60kg × 8/)).toBeVisible();
  });

  test('휴식 타이머 목표를 ±15초 조절할 수 있다', async ({ page }) => {
    await startUpperA(page);
    await logSet(page, '바벨 벤치프레스', 60, 10);
    const timer = page.getByRole('timer');
    await expect(timer).toContainText('2:30');
    await page.getByRole('button', { name: '휴식 +15초' }).click();
    await expect(timer).toContainText('2:45');
    await page.getByRole('button', { name: '휴식 -15초' }).click();
    await page.getByRole('button', { name: '휴식 -15초' }).click();
    await expect(timer).toContainText('2:15');
  });

  test('RIR 을 몰라도 "모름"으로 기록할 수 있다', async ({ page }) => {
    await startUpperA(page);
    await logSet(page, '바벨 벤치프레스', 60, 10, '모름');
    await expect(card(page, '바벨 벤치프레스').getByText(/RIR 추정/)).toBeVisible();
  });
});

test.describe('J6 — PC 에서 입력하고 폰으로 옮기기', () => {
  test('PC 키보드 입력: Enter 로 다음 세트 칸, Ctrl+Enter 로 저장', async ({ page }) => {
    await page.goto('/#log');
    const form = card(page, '지난 기록 직접 입력');
    await form.getByLabel('날짜').fill(localDate(2));
    await form.getByRole('combobox', { name: '운동' }).selectOption({ label: '바벨 백스쿼트' });
    await form.getByRole('spinbutton', { name: '1세트 무게' }).fill('100');
    await form.getByRole('spinbutton', { name: '1세트 반복' }).fill('8');
    await form.getByRole('spinbutton', { name: '1세트 반복' }).press('Enter');
    // 새 줄이 생기고 무게 칸으로 커서 이동, 값은 이전 세트 복사
    await expect(form.getByRole('spinbutton', { name: '2세트 무게' })).toBeFocused();
    await expect(form.getByRole('spinbutton', { name: '2세트 무게' })).toHaveValue('100');
    await page.keyboard.type('5'); // 100 → 1005 가 되지 않도록 포커스 시 전체 선택
    await expect(form.getByRole('spinbutton', { name: '2세트 무게' })).toHaveValue('5');
    await form.getByRole('spinbutton', { name: '2세트 무게' }).fill('95');
    await form.getByRole('spinbutton', { name: '2세트 반복' }).press('Control+Enter');
    await expect(page.getByRole('status').first()).toContainText('바벨 백스쿼트 2세트 저장됨');
  });

  test('PC 에서 만든 코드를 폰에 붙여넣으면 기록이 합쳐진다', async ({ browser }) => {
    const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' as const, baseURL: 'http://127.0.0.1:4173' };
    const pcCtx = await browser.newContext({ serviceWorkers: 'block', baseURL: 'http://127.0.0.1:4173', permissions: ['clipboard-read', 'clipboard-write'] });
    const phoneCtx = await browser.newContext(mobile);
    const pcPage = await pcCtx.newPage();
    const phonePage = await phoneCtx.newPage();

    // 폰에는 원래 기록이 하나 있음
    await phonePage.goto('/#log');
    await addManualRecord(phonePage, { daysAgo: 1, exercise: '컨벤셔널 데드리프트', sets: [[140, 5]] });

    // PC 에서 입력 후 보내기
    await pcPage.goto('/#log');
    await addManualRecord(pcPage, { daysAgo: 3, exercise: '바벨 벤치프레스', sets: [[80, 8], [80, 7]] });
    const send = card(pcPage, '기기 간 기록 옮기기');
    await send.getByRole('button', { name: '보낼 코드 만들기' }).click();
    await expect(send.getByText(/1개 세션 · 2세트/)).toBeVisible();
    const code = await send.getByLabel('보낼 코드').inputValue();
    expect(code).toMatch(/^GC[01]\./);
    await send.getByRole('button', { name: '코드 복사' }).click();
    await expect(send.getByText('복사됨')).toBeVisible();

    // 폰에서 받기 (카톡에서 복사하면 앞뒤에 글자가 붙을 수 있음)
    const recv = card(phonePage, '기기 간 기록 옮기기');
    await recv.getByLabel('받은 코드 붙여넣기').fill(`나와의 채팅\n${code}\n오후 8:01`);
    await recv.getByRole('button', { name: '받기 (기존 기록에 합치기)' }).click();
    await expect(recv.getByRole('status')).toContainText('2세트 추가');

    const list = card(phonePage, '직접 입력한 기록');
    await expect(list.getByText('바벨 벤치프레스')).toBeVisible();
    await expect(list.getByText('컨벤셔널 데드리프트')).toBeVisible();

    // 같은 코드를 또 받아도 중복 없음
    await recv.getByLabel('받은 코드 붙여넣기').fill(code);
    await recv.getByRole('button', { name: '받기 (기존 기록에 합치기)' }).click();
    await expect(recv.getByRole('status')).toContainText('이미 있는 2세트는 건너뜀');

    await pcCtx.close();
    await phoneCtx.close();
  });
});

test.describe('J5 — 논문 기반 분석 리포트', () => {
  test('부족한 부위와 할 일, 근거 논문을 보여준다', async ({ page }) => {
    await page.goto('/#log');
    await addManualRecord(page, { daysAgo: 2, exercise: '사이드 레터럴 레이즈', sets: [[8, 15], [8, 15]] });
    await nav(page, '분석');
    const report = card(page, '분석 리포트');
    await expect(report.getByText('측면 삼각근')).toBeVisible();
    await expect(report.getByText(/\+\d+세트/).first()).toBeVisible();
    await expect(report.getByRole('link', { name: /Schoenfeld/ }).first()).toBeVisible();
  });
});

test.describe('아이폰 대응', () => {
  test('iOS 홈 화면 설치용 메타·아이콘이 있다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png/);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    const icon = await page.request.get('apple-touch-icon.png');
    expect(icon.ok()).toBe(true);
    expect(icon.headers()['content-type']).toContain('image/png');
  });

  test('입력창 글자 크기가 16px 이상이라 iOS 에서 확대되지 않는다', async ({ page }) => {
    await startUpperA(page);
    const size = await card(page, '바벨 벤치프레스')
      .getByRole('spinbutton', { name: '무게' })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });
});
