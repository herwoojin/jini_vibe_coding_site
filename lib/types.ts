// MacroSignal — 공통 타입 정의 (ERD 기반)

// === 테이블 엔티티 ===

export interface Market {
  id: number;
  code: 'kospi' | 'kosdaq' | 'nasdaq';
  name: string;
  region: 'KR' | 'US';
}

export interface Indicator {
  id: number;
  code: string;
  name: string;
  category: 'rate' | 'fx' | 'oil' | 'index';
  source: 'ecos' | 'fred' | 'twelvedata' | 'kis';
  unit: string;
  realtime: boolean;
}

export interface MarketData {
  id: number;
  indicator_id: number;
  ts: string;
  value: number;
  change_abs: number | null;
  change_pct: number | null;
  as_of: string;
  stale: boolean;
}

export interface MarketWeight {
  id: number;
  market_id: number;
  indicator_id: number;
  weight: number;
  sign: 1 | -1;
}

export interface Correlation {
  id: number;
  market_id: number;
  indicator_id: number;
  window: '90d' | '1y';
  coef: number;
  updated_at: string;
}

export interface DailySignal {
  id: number;
  user_id: string;
  market_id: number;
  date: string;
  score: number;
  level: 'green' | 'yellow' | 'red';
  contributors: Contributor[];
  briefing: string | null;
  created_at: string;
}

export interface OvernightSnapshot {
  id: number;
  date: string;
  us10y: number;
  wti: number;
  brent: number;
  usdkrw: number;
  usdjpy: number;
  dxy: number;
  nasdaq_close: number;
  nasdaq_fut: number;
  created_at: string;
}

// === 엔진 타입 ===

export interface Contributor {
  indicator_code: string;
  indicator_name: string;
  z_score: number;
  weight: number;
  sign: 1 | -1;
  contrib: number;
}

export interface MarketScore {
  market_code: string;
  market_name: string;
  score: number;
  level: 'green' | 'yellow' | 'red';
  contributors: Contributor[];
  briefing?: string;
}

export interface SignalResult {
  date: string;
  markets: MarketScore[];
}

// === DataSourceAdapter 인터페이스 ===

export interface Quote {
  symbol: string;
  value: number;
  asOf: string;
  changePct?: number;
}

export interface Bar {
  ts: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
}

export interface SeriesOpts {
  interval: '1min' | '5min' | '1day';
  outputsize?: number;
  from?: string;
}

export interface DataSourceAdapter {
  id: string;
  fetchLatest(symbol: string): Promise<Quote>;
  fetchSeries(symbol: string, opts: SeriesOpts): Promise<Bar[]>;
  healthCheck(): Promise<boolean>;
}

// === UI 보조 타입 ===

/** 'live' = 외부 API 실측값, 'mock' = 하드코딩된 더미값 */
export type DataOrigin = 'live' | 'mock';

export interface MacroCardData {
  indicator: Indicator;
  current: number;
  changeAbs: number;
  changePct: number;
  asOf: string;
  stale: boolean;
  sparkline: number[];
  origin: DataOrigin;
}
