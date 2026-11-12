import type { ReactNode } from 'react';
import { Badge, Card, CitationChip } from '../components/ui';
import { CITATIONS, EVIDENCE_LABEL } from '../domain/research';

function Step({ n, title, children, cites }: { n: number; title: string; children: ReactNode; cites: string[] }) {
  return (
    <li className="rounded-xl bg-slate-950/50 p-3">
      <p className="font-semibold">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-sm text-slate-950">{n}</span>
        {title}
      </p>
      <div className="mt-1.5 space-y-1 text-sm text-slate-300">{children}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {cites.map((c) => (
          <CitationChip key={c} id={c} />
        ))}
      </div>
    </li>
  );
}

export function GuidePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">근비대 루틴 짜는 법</h1>
      <p className="text-sm text-slate-400">이 앱은 <b>근력(1RM)보다 근육 크기(근비대)</b>를 목표로 처방합니다.</p>

      <Card title="근비대 루틴 8단계">
        <ol className="space-y-3">
          <Step n={1} title="주당 운동 가능 일수 → 분할법 결정" cites={['schoenfeld2016freq']}>
            <p>2~3일: 무분할 · 4일: 상·하체 · 5일: 상·하체+PPL · 6일: PPL×2.</p>
            <p>핵심은 분할 이름이 아니라 <b>부위별 주 2회 이상</b> 자극되는지입니다.</p>
          </Step>
          <Step n={2} title="부위별 주간 볼륨: 주 10~20세트" cites={['schoenfeld2017volume', 'bazvalle2022', 'pelland2024']}>
            <p>실패 근처까지 한 "하드 세트"만 셉니다. 벤치프레스는 가슴 1세트 + 삼두·전면 삼각근 0.5세트로 계산합니다.</p>
            <p>볼륨이 늘수록 효과는 커지지만 점점 체감됩니다. 낮게 시작해 회복되는 만큼 올리세요.</p>
          </Step>
          <Step n={3} title="반복 범위: 6~30회 모두 유효, 6~12회가 효율적" cites={['schoenfeld2017load', 'schoenfeld2021continuum']}>
            <p>실패에 가깝게 한다면 무게 자체보다 노력 정도가 중요합니다. 1~5회 저반복은 근력에 유리하지만 근비대엔 시간 대비 비효율적입니다.</p>
            <p>앱 기본값: 바벨 복합 6~10회 · 머신/덤벨/스미스 복합 8~12회 · 고립 10~15회 · 측면 삼각근·종아리 12~20회.</p>
          </Step>
          <Step n={4} title="강도: 실패까지 0~3회 남기기 (RIR)" cites={['refalo2023', 'robinson2024', 'halperin2022']}>
            <p>근비대는 실패에 가까울수록 커지는 경향이 있지만, 매 세트 완전 실패는 필요 없습니다. 1주차 RIR 3 → 마지막 주 RIR 0~1.</p>
            <p>
              <b>RIR 을 재본 적이 없다면:</b> 세트를 끝내고 "같은 자세로 몇 개 더 할 수 있었나?"만 고르세요. 처음엔 대부분 1개쯤 적게 예상하고, 기록할수록 정확해집니다.
              모르면 "모름"을 눌러도 됩니다 — 앱이 RIR 2로 가정하고 "추정"으로 표시합니다.
            </p>
          </Step>
          <Step n={5} title="휴식: 복합 2~3분, 고립 1.5~2분" cites={['schoenfeld2016rest', 'singer2024']}>
            <p>60초 이하 휴식은 다음 세트 반복 수를 줄여 총 자극을 떨어뜨립니다. 앱이 세트 완료 시 자동으로 휴식을 측정합니다.</p>
          </Step>
          <Step n={6} title="점진적 과부하: 더블 프로그레션" cites={['helms2016', 'epley1985']}>
            <p>범위 안에서 반복 수를 늘리고 → 모든 세트가 상한에 도달하면 증량 → 다시 하한부터.</p>
            <p>범위 아래로 떨어지면 추정 1RM 기준으로 무게를 낮춥니다.</p>
          </Step>
          <Step n={7} title="4~8주마다 디로딩" cites={['bell2023']}>
            <p>세트 수를 절반으로, 무게는 약간 낮추고, 실패에서 4회 이상 여유를 둡니다.</p>
            <p>수행 하락이 여러 종목에서 보이거나 컨디션이 계속 나쁘면 앞당깁니다.</p>
          </Step>
          <Step n={8} title="종목 선택: 늘어난 위치 + 적당한 변화" cites={['maeo2021', 'pedrosa2022', 'kassiano2022']}>
            <p>근육이 길게 늘어난 위치에서 부하를 받는 종목이 유리합니다 (시티드 레그 컬, 인클라인 컬, 오버헤드 익스텐션 등).</p>
            <p>같은 부위에 2가지 종목을 섞거나 메소사이클마다 일부 종목을 바꾸면 고르게 발달합니다. 운동 중 "교체" 버튼으로 언제든 바꾸세요.</p>
          </Step>
        </ol>
      </Card>

      <Card title="앱 지표 설명">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-semibold">하드 세트</dt>
            <dd className="text-slate-400">워밍업이 아니고 RIR 4 이하인 세트. 볼륨·빈도 계산에 사용.</dd>
          </div>
          <div>
            <dt className="font-semibold">추정 1RM</dt>
            <dd className="text-slate-400">무게 × (1 + (반복 + RIR) / 30). 세션 간 수행 비교·정체 감지에 사용.</dd>
          </div>
          <div>
            <dt className="font-semibold">부위별 회복도</dt>
            <dd className="text-slate-400">
              세트마다 피로를 쌓고 부위별 회복 시간(작은 근육 36시간 ~ 큰 근육 72시간)에 따라 감소시키는 <b>추정 모델</b>. 직접 검증된 값이 아니므로 실제 근육통·수행과 함께 판단하세요.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">컨디션 점수</dt>
            <dd className="text-slate-400">수면·근육통·의욕·스트레스(각 1~5)의 평균을 0~100으로 환산. 40 미만이면 세트를 줄입니다.</dd>
          </div>
          <div>
            <dt className="font-semibold">전신 부하 비율</dt>
            <dd className="text-slate-400">최근 7일 하드 세트 ÷ 직전 4주 주평균. 1.5 초과면 볼륨 급증 신호.</dd>
          </div>
        </dl>
      </Card>

      <Card title="참고 문헌">
        <ul className="space-y-3 text-sm">
          {Object.values(CITATIONS).map((c) => (
            <li key={c.id}>
              <p className="font-medium text-slate-200">
                {c.short} <Badge>{EVIDENCE_LABEL[c.level]}</Badge>
              </p>
              <p className="text-slate-400">
                {c.title}. <i>{c.journal}</i>, {c.year}.{' '}
                {c.doi && (
                  <a className="text-emerald-300 underline" href={`https://doi.org/${c.doi}`} target="_blank" rel="noreferrer">
                    doi:{c.doi}
                  </a>
                )}
              </p>
              <p className="mt-0.5 text-slate-300">→ {c.finding}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          앱의 수치는 위 문헌의 평균적 결과를 개인 기록에 적용한 출발점입니다. 개인차가 크므로 본인의 수행 변화를 우선하세요.
        </p>
      </Card>

      <Card title="주의">
        <p className="text-sm text-slate-400">
          이 앱은 의료 조언을 제공하지 않습니다. 관절 통증, 날카로운 통증, 부상이 의심되면 운동을 중단하고 전문가와 상담하세요.
        </p>
      </Card>
    </div>
  );
}
