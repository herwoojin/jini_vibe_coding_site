// MacroSignal — Mock 데이터 (ERD 시드 기반)
import type {
  Market, Indicator, MarketWeight, MarketData,
  DailySignal, OvernightSnapshot, Correlation, MacroCardData,
} from '../types';

// === Markets ===
export const markets: Market[] = [
  { id: 1, code: 'kospi', name: '코스피', region: 'KR' },
  { id: 2, code: 'kosdaq', name: '코스닥', region: 'KR' },
  { id: 3, code: 'nasdaq', name: '나스닥', region: 'US' },
];

// === Indicators ===
export const indicators: Indicator[] = [
  { id: 1, code: 'DGS10', name: '미국 10년 국채금리', category: 'rate', source: 'fred', unit: '%', realtime: false },
  { id: 2, code: 'KR3Y', name: '한국 국고채 3년', category: 'rate', source: 'ecos', unit: '%', realtime: false },
  { id: 3, code: 'BASE_KR', name: '한국 기준금리', category: 'rate', source: 'ecos', unit: '%', realtime: false },
  { id: 4, code: 'FEDFUNDS', name: '미국 연방기금금리', category: 'rate', source: 'fred', unit: '%', realtime: false },
  // 환율은 Twelve Data(당일 장중 값) 우선, 실패 시 ECOS(전일 종가) 폴백.
  { id: 5, code: 'USD/KRW', name: '원달러 환율', category: 'fx', source: 'twelvedata', unit: 'KRW', realtime: true },
  { id: 6, code: 'USD/JPY', name: '달러엔 환율', category: 'fx', source: 'twelvedata', unit: 'JPY', realtime: true },
  // ICE DXY 무료 소스가 없어 연준 광의 달러지수(DTWEXBGS)로 대체. 별개 지수라 이름을 정직하게 표기.
  { id: 7, code: 'DXY', name: '광의 달러지수', category: 'fx', source: 'fred', unit: 'pt', realtime: false },
  { id: 8, code: 'WTI', name: 'WTI 유가', category: 'oil', source: 'fred', unit: 'USD/bbl', realtime: false },
  { id: 9, code: 'XBR', name: '브렌트 유가', category: 'oil', source: 'fred', unit: 'USD/bbl', realtime: false },
  { id: 10, code: 'NASDAQCOM', name: '나스닥 종합', category: 'index', source: 'fred', unit: 'pt', realtime: false },
  { id: 11, code: 'KOSPI', name: '코스피', category: 'index', source: 'ecos', unit: 'pt', realtime: false },
  { id: 12, code: 'KOSDAQ', name: '코스닥', category: 'index', source: 'ecos', unit: 'pt', realtime: false },
];

// === Market Weights (ERD 4번 시드) ===
export const marketWeights: MarketWeight[] = [
  // 코스피
  { id: 1, market_id: 1, indicator_id: 5, weight: 0.9, sign: -1 }, // USD/KRW
  { id: 2, market_id: 1, indicator_id: 1, weight: 0.5, sign: -1 }, // DGS10
  { id: 3, market_id: 1, indicator_id: 10, weight: 0.7, sign: 1 },  // NASDAQCOM
  { id: 4, market_id: 1, indicator_id: 8, weight: 0.3, sign: -1 }, // WTI
  { id: 5, market_id: 1, indicator_id: 7, weight: 0.6, sign: -1 }, // DXY
  // 코스닥
  { id: 6, market_id: 2, indicator_id: 1, weight: 0.9, sign: -1 }, // DGS10
  { id: 7, market_id: 2, indicator_id: 10, weight: 0.9, sign: 1 },  // NASDAQCOM
  { id: 8, market_id: 2, indicator_id: 5, weight: 0.5, sign: -1 }, // USD/KRW
  { id: 9, market_id: 2, indicator_id: 7, weight: 0.5, sign: -1 }, // DXY
  // 나스닥
  { id: 10, market_id: 3, indicator_id: 1, weight: 1.0, sign: -1 }, // DGS10
  { id: 11, market_id: 3, indicator_id: 7, weight: 0.7, sign: -1 }, // DXY
  { id: 12, market_id: 3, indicator_id: 8, weight: 0.2, sign: -1 }, // WTI
];

// === 스파크라인 생성 유틸 ===
function generateSparkline(base: number, volatility: number, points: number = 24): number[] {
  const data: number[] = [];
  let val = base;
  for (let i = 0; i < points; i++) {
    val += (Math.random() - 0.5) * volatility;
    data.push(Math.round(val * 100) / 100);
  }
  return data;
}

// === Market Data (최신 시세 — 고정 Mock) ===
const now = new Date().toISOString();

export const latestMarketData: Record<string, { value: number; change_abs: number; change_pct: number; sparkline: number[] }> = {
  'DGS10':     { value: 4.28,    change_abs: 0.12,   change_pct: 2.88,   sparkline: generateSparkline(4.28, 0.05) },
  'KR3Y':      { value: 2.85,    change_abs: -0.03,  change_pct: -1.04,  sparkline: generateSparkline(2.85, 0.02) },
  'BASE_KR':   { value: 2.75,    change_abs: 0,      change_pct: 0,      sparkline: [2.75, 2.75, 2.75, 2.75, 2.75, 2.75] },
  'FEDFUNDS':  { value: 4.33,    change_abs: 0,      change_pct: 0,      sparkline: [4.33, 4.33, 4.33, 4.33, 4.33, 4.33] },
  'USD/KRW':   { value: 1382.50, change_abs: 8.30,   change_pct: 0.60,   sparkline: generateSparkline(1382, 5) },
  'USD/JPY':   { value: 160.85,  change_abs: 0.45,   change_pct: 0.28,   sparkline: generateSparkline(160.85, 0.3) },
  'DXY':       { value: 104.92,  change_abs: 0.35,   change_pct: 0.33,   sparkline: generateSparkline(104.92, 0.2) },
  'WTI':       { value: 73.85,   change_abs: -1.20,  change_pct: -1.60,  sparkline: generateSparkline(73.85, 0.5) },
  'XBR':       { value: 78.42,   change_abs: -0.95,  change_pct: -1.20,  sparkline: generateSparkline(78.42, 0.4) },
  'NASDAQCOM': { value: 17892.4, change_abs: 125.3,  change_pct: 0.71,   sparkline: generateSparkline(17892, 50) },
};

// === Overnight Snapshot ===
export const overnightSnapshot: OvernightSnapshot = {
  id: 1,
  date: new Date().toISOString().split('T')[0],
  us10y: 4.28,
  wti: 73.85,
  brent: 78.42,
  usdkrw: 1382.50,
  usdjpy: 160.85,
  dxy: 104.92,
  nasdaq_close: 17892.4,
  nasdaq_fut: 17920.0,
  created_at: now,
};

// === Daily Signal (Mock 진단 결과) ===
export const dailySignals: DailySignal[] = [
  {
    id: 1, user_id: 'mock-user', market_id: 1,
    date: new Date().toISOString().split('T')[0],
    score: -0.85, level: 'yellow',
    contributors: [
      { indicator_code: 'USD/KRW', indicator_name: '원달러 환율', z_score: 1.2, weight: 0.9, sign: -1, contrib: -1.08 },
      { indicator_code: 'DGS10', indicator_name: '미국 10년 국채금리', z_score: 1.5, weight: 0.5, sign: -1, contrib: -0.75 },
      { indicator_code: 'NASDAQCOM', indicator_name: '나스닥 종합', z_score: 0.8, weight: 0.7, sign: 1, contrib: 0.56 },
      { indicator_code: 'WTI', indicator_name: 'WTI 유가', z_score: -0.9, weight: 0.3, sign: -1, contrib: 0.27 },
      { indicator_code: 'DXY', indicator_name: '달러인덱스', z_score: 0.6, weight: 0.6, sign: -1, contrib: -0.36 },
    ],
    briefing: '밤사이 미국 10년물 금리가 12bp 상승하며 위험자산 전반에 부담을 주고 있습니다. 원달러 환율이 1,382원대로 올라서며 외국인 매도 압력이 예상됩니다. 다만 나스닥이 소폭 반등하며 극단적 약세 전환 가능성은 제한적입니다. 본 내용은 투자 참고 정보이며 투자 권유가 아닙니다.',
    created_at: now,
  },
  {
    id: 2, user_id: 'mock-user', market_id: 2,
    date: new Date().toISOString().split('T')[0],
    score: -1.65, level: 'red',
    contributors: [
      { indicator_code: 'DGS10', indicator_name: '미국 10년 국채금리', z_score: 1.5, weight: 0.9, sign: -1, contrib: -1.35 },
      { indicator_code: 'NASDAQCOM', indicator_name: '나스닥 종합', z_score: 0.8, weight: 0.9, sign: 1, contrib: 0.72 },
      { indicator_code: 'USD/KRW', indicator_name: '원달러 환율', z_score: 1.2, weight: 0.5, sign: -1, contrib: -0.60 },
      { indicator_code: 'DXY', indicator_name: '달러인덱스', z_score: 0.6, weight: 0.5, sign: -1, contrib: -0.30 },
    ],
    briefing: '미국 10년물 금리가 12bp 급등하며 성장주 전반에 부담을 주는 환경입니다. 코스닥은 성장주 비중이 높아 금리 상승에 특히 민감하게 반응하는 경향이 있습니다. 나스닥 선물도 약세를 보여 위험선호가 위축된 상태입니다. 본 내용은 투자 참고 정보이며 투자 권유가 아닙니다.',
    created_at: now,
  },
  {
    id: 3, user_id: 'mock-user', market_id: 3,
    date: new Date().toISOString().split('T')[0],
    score: 0.45, level: 'green',
    contributors: [
      { indicator_code: 'DGS10', indicator_name: '미국 10년 국채금리', z_score: 1.5, weight: 1.0, sign: -1, contrib: -1.50 },
      { indicator_code: 'DXY', indicator_name: '달러인덱스', z_score: 0.6, weight: 0.7, sign: -1, contrib: -0.42 },
      { indicator_code: 'WTI', indicator_name: 'WTI 유가', z_score: -0.9, weight: 0.2, sign: -1, contrib: 0.18 },
    ],
    briefing: '기술주 실적 기대감이 금리 상승 부담을 상쇄하며 나스닥은 완만한 상승세를 이어가고 있습니다. 달러 강세가 다국적 기업 실적에 소폭 부담이 되지만 전체적으로 우호적 환경입니다. 유가 하락은 인플레이션 우려를 완화시키는 긍정 요인입니다. 본 내용은 투자 참고 정보이며 투자 권유가 아닙니다.',
    created_at: now,
  },
];

// === Correlations (Mock 상관계수) ===
export const correlations: Correlation[] = [
  { id: 1, market_id: 1, indicator_id: 5, window: '90d', coef: -0.72, updated_at: now },
  { id: 2, market_id: 1, indicator_id: 1, window: '90d', coef: -0.45, updated_at: now },
  { id: 3, market_id: 1, indicator_id: 10, window: '90d', coef: 0.68, updated_at: now },
  { id: 4, market_id: 1, indicator_id: 8, window: '90d', coef: -0.25, updated_at: now },
  { id: 5, market_id: 1, indicator_id: 7, window: '90d', coef: -0.55, updated_at: now },
  { id: 6, market_id: 2, indicator_id: 1, window: '90d', coef: -0.82, updated_at: now },
  { id: 7, market_id: 2, indicator_id: 10, window: '90d', coef: 0.78, updated_at: now },
  { id: 8, market_id: 2, indicator_id: 5, window: '90d', coef: -0.48, updated_at: now },
  { id: 9, market_id: 2, indicator_id: 7, window: '90d', coef: -0.40, updated_at: now },
  { id: 10, market_id: 3, indicator_id: 1, window: '90d', coef: -0.65, updated_at: now },
  { id: 11, market_id: 3, indicator_id: 7, window: '90d', coef: -0.58, updated_at: now },
  { id: 12, market_id: 3, indicator_id: 8, window: '90d', coef: -0.15, updated_at: now },
];

// === MacroCard 데이터 어셈블리 ===
export function getMacroCards(): MacroCardData[] {
  const displayIndicators = ['DGS10', 'KR3Y', 'USD/KRW', 'USD/JPY', 'DXY', 'WTI', 'XBR'];
  return displayIndicators.map(code => {
    const ind = indicators.find(i => i.code === code)!;
    const data = latestMarketData[code];
    return {
      indicator: ind,
      current: data.value,
      changeAbs: data.change_abs,
      changePct: data.change_pct,
      asOf: now,
      stale: false,
      sparkline: data.sparkline,
      origin: 'mock',
    };
  });
}
