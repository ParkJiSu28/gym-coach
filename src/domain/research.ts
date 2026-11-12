import type { EvidenceLevel, Muscle } from './types';

export interface Citation {
  id: string;
  short: string;
  title: string;
  journal: string;
  year: number;
  doi?: string;
  level: EvidenceLevel;
  finding: string;
}

/**
 * 추천 규칙의 근거 문헌. 앱의 모든 "왜?" 카드는 이 id 로 참조한다.
 * DOI는 공개 출판 정보를 기준으로 기재 — 원문 확인을 권장한다.
 */
export const CITATIONS: Record<string, Citation> = {
  schoenfeld2017volume: {
    id: 'schoenfeld2017volume',
    short: 'Schoenfeld et al., 2017',
    title: 'Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis',
    journal: 'Journal of Sports Sciences',
    year: 2017,
    doi: '10.1080/02640414.2016.1210197',
    level: 'meta-analysis',
    finding: '주당 세트 수가 늘수록 근비대가 커지는 용량-반응 관계. 근육당 주 10세트 이상이 그 미만보다 유리.',
  },
  bazvalle2022: {
    id: 'bazvalle2022',
    short: 'Baz-Valle et al., 2022',
    title: 'A Systematic Review of The Effects of Different Resistance Training Volumes on Muscle Hypertrophy',
    journal: 'Journal of Human Kinetics',
    year: 2022,
    doi: '10.2478/hukin-2022-0017',
    level: 'meta-analysis',
    finding: '훈련자에게 근육당 주 12~20세트 범위가 근비대에 효과적이며, 그 이상은 추가 이득이 불분명.',
  },
  pelland2024: {
    id: 'pelland2024',
    short: 'Pelland et al., 2024 (preprint)',
    title: 'The Resistance Training Dose-Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gain',
    journal: 'SportRxiv (preprint)',
    year: 2024,
    doi: '10.51224/SRXIV.460',
    level: 'meta-analysis',
    finding: '볼륨이 늘수록 근비대는 증가하나 수확 체감. 협력근으로 동원된 간접 세트는 0.5세트로 계산하는 방식이 가장 설명력이 높음.',
  },
  schoenfeld2016freq: {
    id: 'schoenfeld2016freq',
    short: 'Schoenfeld et al., 2016',
    title: 'Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis',
    journal: 'Sports Medicine',
    year: 2016,
    doi: '10.1007/s40279-016-0543-8',
    level: 'meta-analysis',
    finding: '근육별 주 2회 이상 훈련이 주 1회보다 근비대에 유리.',
  },
  schoenfeld2017load: {
    id: 'schoenfeld2017load',
    short: 'Schoenfeld et al., 2017',
    title: 'Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training: A Systematic Review and Meta-analysis',
    journal: 'Journal of Strength and Conditioning Research',
    year: 2017,
    doi: '10.1519/JSC.0000000000002200',
    level: 'meta-analysis',
    finding: '실패에 가깝게 수행한다면 저중량(고반복)과 고중량(저반복) 모두 비슷한 근비대. 근력은 고중량이 유리.',
  },
  refalo2023: {
    id: 'refalo2023',
    short: 'Refalo et al., 2023',
    title: 'Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis',
    journal: 'Sports Medicine',
    year: 2023,
    doi: '10.1007/s40279-022-01784-y',
    level: 'meta-analysis',
    finding: '실패 직전(낮은 RIR)까지 수행해야 하지만, 매 세트 완전 실패가 필수는 아님. 0~3 RIR 범위면 충분한 자극.',
  },
  schoenfeld2016rest: {
    id: 'schoenfeld2016rest',
    short: 'Schoenfeld et al., 2016',
    title: 'Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men',
    journal: 'Journal of Strength and Conditioning Research',
    year: 2016,
    doi: '10.1519/JSC.0000000000001272',
    level: 'rct',
    finding: '세트 간 3분 휴식이 1분 휴식보다 근비대·근력 모두 우수.',
  },
  singer2024: {
    id: 'singer2024',
    short: 'Singer et al., 2024',
    title: 'Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy',
    journal: 'Frontiers in Sports and Active Living',
    year: 2024,
    doi: '10.3389/fspor.2024.1429789',
    level: 'meta-analysis',
    finding: '60초 초과 휴식이 약간 유리. 90초 이상에서는 큰 차이 없음.',
  },
  helms2016: {
    id: 'helms2016',
    short: 'Helms et al., 2016',
    title: 'Application of the Repetitions in Reserve-Based Rating of Perceived Exertion Scale for Resistance Training',
    journal: 'Strength and Conditioning Journal',
    year: 2016,
    doi: '10.1519/SSC.0000000000000218',
    level: 'expert-opinion',
    finding: 'RIR 기반 RPE 척도로 세트 강도를 기록하고 다음 세션 부하를 자동조절(오토레귤레이션).',
  },
  bell2023: {
    id: 'bell2023',
    short: 'Bell et al., 2023',
    title: 'Integrating Deloading into Strength and Physique Sports Training Programmes: An International Delphi Consensus Approach',
    journal: 'Sports Medicine - Open',
    year: 2023,
    doi: '10.1186/s40798-023-00633-0',
    level: 'consensus',
    finding: '디로딩은 4~8주마다 약 1주, 볼륨(세트 수)을 줄이고 강도(RIR↑)를 낮추는 방식. 수행 저하·피로 누적 시 앞당김.',
  },
  schoenfeld2021continuum: {
    id: 'schoenfeld2021continuum',
    short: 'Schoenfeld et al., 2021',
    title: 'Loading Recommendations for Muscle Strength, Hypertrophy, and Local Endurance: A Re-Examination of the Repetition Continuum',
    journal: 'Sports',
    year: 2021,
    doi: '10.3390/sports9020032',
    level: 'expert-opinion',
    finding: '근비대는 넓은 반복 범위(약 6~30회)에서 일어나지만, 중간 반복(6~12회)이 시간 대비 효율적. 근력은 저반복이 유리 — 근비대 목적이면 저반복(1~5회) 위주는 비효율.',
  },
  robinson2024: {
    id: 'robinson2024',
    short: 'Robinson et al., 2024',
    title: 'Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions',
    journal: 'Sports Medicine',
    year: 2024,
    doi: '10.1007/s40279-024-02069-2',
    level: 'meta-analysis',
    finding: '실패에 가까울수록 근비대가 커지는 경향(근력은 실패 근접도 영향이 작음). 근비대 목적이면 RIR 0~3 범위를 유지.',
  },
  plotkin2022: {
    id: 'plotkin2022',
    short: 'Plotkin et al., 2022',
    title: 'Progressive overload without progressing load? The effects of load or repetition progression on muscular adaptations',
    journal: 'PeerJ',
    year: 2022,
    doi: '10.7717/peerj.14142',
    level: 'rct',
    finding: '무게를 올리는 방식과 반복 수를 늘리는 방식 모두 비슷한 근비대 — 더블 프로그레션(반복 → 무게)의 근거.',
  },
  halperin2022: {
    id: 'halperin2022',
    short: 'Halperin et al., 2022',
    title: 'Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis',
    journal: 'Sports Medicine',
    year: 2022,
    doi: '10.1007/s40279-021-01559-x',
    level: 'meta-analysis',
    finding: '사람들은 남은 반복 수를 평균 약 1회 과소평가하며, 실패에 가까울수록·경험이 쌓일수록 정확해짐. RIR 을 꾸준히 기록하면 추정이 나아짐.',
  },
  kassiano2022: {
    id: 'kassiano2022',
    short: 'Kassiano et al., 2022',
    title: 'Does Varying Resistance Exercises Promote Superior Muscle Hypertrophy and Strength Gains? A Systematic Review',
    journal: 'Journal of Strength and Conditioning Research',
    year: 2022,
    doi: '10.1519/JSC.0000000000004258',
    level: 'meta-analysis',
    finding: '같은 부위라도 종목을 적절히 바꿔주면 근육의 여러 부위가 고르게 성장할 수 있음. 단, 너무 잦은 무작위 교체는 이득이 없음.',
  },
  maeo2021: {
    id: 'maeo2021',
    short: 'Maeo et al., 2021',
    title: 'Greater Hamstrings Muscle Hypertrophy but Similar Damage Protection after Training at Long versus Short Muscle Lengths',
    journal: 'Medicine & Science in Sports & Exercise',
    year: 2021,
    doi: '10.1249/MSS.0000000000002523',
    level: 'rct',
    finding: '근육이 늘어난 위치에서 훈련하는 시티드 레그 컬이 라잉 레그 컬보다 햄스트링 근비대가 큼.',
  },
  pedrosa2022: {
    id: 'pedrosa2022',
    short: 'Pedrosa et al., 2022',
    title: 'Partial range of motion training elicits favorable improvements in muscular adaptations when carried out at long muscle lengths',
    journal: 'European Journal of Sport Science',
    year: 2022,
    doi: '10.1080/17461391.2021.1927199',
    level: 'rct',
    finding: '근육이 길게 늘어난 구간의 자극이 근비대에 유리. 인클라인 컬·오버헤드 익스텐션처럼 신장 위치 부하가 큰 종목 선택 근거.',
  },
  epley1985: {
    id: 'epley1985',
    short: 'Epley, 1985',
    title: 'Poundage Chart (Boyd Epley Workout)',
    journal: 'Body Enterprises',
    year: 1985,
    level: 'expert-opinion',
    finding: '추정 1RM = 무게 × (1 + 반복수/30). 10회 이하에서 정확도가 높음.',
  },
  israetel_landmarks: {
    id: 'israetel_landmarks',
    short: 'Israetel et al. (RP)',
    title: 'Scientific Principles of Hypertrophy Training — Volume Landmarks (MEV/MAV/MRV)',
    journal: 'Renaissance Periodization (서적)',
    year: 2021,
    level: 'expert-opinion',
    finding: '근육별 최소 효과 볼륨(MEV), 적응 볼륨(MAV), 최대 회복 볼륨(MRV). 실무 경험 기반 — 출발점으로만 사용.',
  },
  app_fatigue_model: {
    id: 'app_fatigue_model',
    short: '앱 자체 추정 모델',
    title: '부위별 피로 누적-감쇠 모델 (지수 감쇠)',
    journal: '—',
    year: 2026,
    level: 'model',
    finding: '세트마다 피로를 누적하고 부위별 회복 시간에 따라 지수적으로 감쇠. 근손상 회복이 대략 48~72시간이라는 일반적 관찰을 근사한 추정치이며 직접 검증된 모델이 아님.',
  },
};

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  'meta-analysis': '메타분석',
  rct: '무작위 대조 연구',
  consensus: '전문가 합의(델파이)',
  'expert-opinion': '전문가 의견',
  model: '추정 모델',
};

/**
 * 근육별 주간 볼륨 기준(직접+간접 0.5 환산 세트).
 * 수치는 RP 볼륨 랜드마크(전문가 의견)를 메타분석 범위(주 10~20세트)에 맞춰 보수적으로 조정한 출발점.
 */
export interface VolumeLandmark {
  mev: number;
  mavLow: number;
  mavHigh: number;
  mrv: number;
}

export const VOLUME_LANDMARKS: Record<Muscle, VolumeLandmark> = {
  chest: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 22 },
  front_delts: { mev: 0, mavLow: 6, mavHigh: 8, mrv: 12 },
  side_delts: { mev: 8, mavLow: 12, mavHigh: 22, mrv: 26 },
  rear_delts: { mev: 6, mavLow: 10, mavHigh: 18, mrv: 22 },
  lats: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 25 },
  upper_back: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 25 },
  biceps: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 24 },
  triceps: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  forearms: { mev: 2, mavLow: 6, mavHigh: 12, mrv: 18 },
  quads: { mev: 8, mavLow: 12, mavHigh: 18, mrv: 20 },
  hamstrings: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  glutes: { mev: 2, mavLow: 6, mavHigh: 12, mrv: 16 },
  calves: { mev: 8, mavLow: 12, mavHigh: 16, mrv: 20 },
  abs: { mev: 0, mavLow: 8, mavHigh: 16, mrv: 25 },
  lower_back: { mev: 0, mavLow: 4, mavHigh: 8, mrv: 12 },
};

/** 부위별 대략 회복 시간(시간 단위, 90% 회복 기준) — 큰 근육·신장성 부하가 큰 근육일수록 길게. 추정치. */
export const RECOVERY_HOURS: Record<Muscle, number> = {
  chest: 60,
  front_delts: 48,
  side_delts: 36,
  rear_delts: 36,
  lats: 60,
  upper_back: 48,
  biceps: 48,
  triceps: 48,
  forearms: 36,
  quads: 72,
  hamstrings: 72,
  glutes: 72,
  calves: 36,
  abs: 36,
  lower_back: 72,
};
