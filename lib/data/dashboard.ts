import { fetchAllSeries } from './series';
import { computeMarketScore } from '../engine/signal';
import { correlateBars } from '../engine/correlation';
import { ruleBasedBriefing } from '../engine/briefing';
import {
  markets,
  indicators,
  marketWeights,
  dailySignals,
  correlations as mockCorrelations,
  overnightSnapshot,
  getMacroCards,
} from '../mock/data';
import type {
  Bar,
  Correlation,
  DataOrigin,
  MacroCardData,
  MarketScore,
} from '../types';

const SPARKLINE_POINTS = 30;
/** z-score 가 의미를 가지려면 필요한 최소 과거 변동 표본 */
const MIN_HISTORY = 20;

export interface OvernightMetric {
  label: string;
  value: number;
  unit: string;
  format?: 'rate' | 'price' | 'index' | 'fx';
}

export interface DashboardData {
  macroCards: MacroCardData[];
  signals: MarketScore[];
  signalsOrigin: DataOrigin;
  /** 신호 계산에 쓰인 데이터 중 가장 최신 관측일 */
  signalsAsOf: string;
  correlations: Correlation[];
  correlationsOrigin: DataOrigin;
  overnight: { date: string; metrics: OvernightMetric[]; origin: DataOrigin };
}

/** 시장 코드 → 상관/신호 계산에서 그 시장을 대표하는 지수 시계열 */
const MARKET_INDEX: Record<string, string> = {
  kospi: 'KOSPI',
  kosdaq: 'KOSDAQ',
  nasdaq: 'NASDAQCOM',
};

/**
 * 대시보드 전체 데이터를 만든다. 시계열 맵 하나를 카드·신호·상관·밤사이가 공유한다.
 * 섹션 단위로 실패를 격리한다: 어떤 섹션이 실측 불가면 그 섹션만 목업으로 강등되고
 * origin 이 'mock' 으로 남아 UI 배지가 정직하게 표시된다.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const series = await fetchAllSeries();

  return {
    macroCards: buildMacroCards(series),
    ...buildSignals(series),
    ...buildCorrelations(series),
    overnight: buildOvernight(series),
  };
}

// === 거시지표 카드 ===

function buildMacroCards(series: Map<string, Bar[]>): MacroCardData[] {
  const mockCards = getMacroCards();
  const liveCards: MacroCardData[] = [];

  for (const indicator of indicators) {
    const bars = series.get(indicator.code);
    if (!bars || bars.length < 2) continue;

    const latest = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const changeAbs = latest.close - prev.close;

    liveCards.push({
      indicator,
      current: latest.close,
      changeAbs,
      changePct: prev.close !== 0 ? (changeAbs / prev.close) * 100 : 0,
      asOf: latest.ts,
      stale: false,
      sparkline: bars.slice(-SPARKLINE_POINTS).map(b => b.close),
      origin: 'live',
    });
  }

  const liveCodes = new Set(liveCards.map(c => c.indicator.code));
  return [...liveCards, ...mockCards.filter(c => !liveCodes.has(c.indicator.code))];
}

// === 시장 신호 (TRD 5) ===

function buildSignals(series: Map<string, Bar[]>): {
  signals: MarketScore[];
  signalsOrigin: DataOrigin;
  signalsAsOf: string;
} {
  const inputs = new Map<
    number,
    { code: string; name: string; currentDelta: number; historicalDeltas: number[]; asOf: string }
  >();

  for (const indicator of indicators) {
    const bars = series.get(indicator.code);
    if (!bars) continue;

    const deltas: number[] = [];
    for (let i = 1; i < bars.length; i++) deltas.push(bars[i].close - bars[i - 1].close);
    if (deltas.length < MIN_HISTORY + 1) continue;

    inputs.set(indicator.id, {
      code: indicator.code,
      name: indicator.name,
      currentDelta: deltas[deltas.length - 1],
      historicalDeltas: deltas.slice(0, -1).slice(-90),
      asOf: bars[bars.length - 1].ts,
    });
  }

  const signals: MarketScore[] = [];
  let asOf = '';

  for (const market of markets) {
    const weights = marketWeights.filter(w => w.market_id === market.id);
    // 가중치에 오른 지표가 하나라도 빠지면 스코어의 의미가 달라진다. 전부 있어야 계산한다.
    const complete = weights.every(w => inputs.has(w.indicator_id));
    if (!complete) break;

    const score = computeMarketScore(market.code, market.name, weights, inputs);
    score.briefing = ruleBasedBriefing(score);
    signals.push(score);

    for (const w of weights) {
      const a = inputs.get(w.indicator_id)!.asOf;
      if (a > asOf) asOf = a;
    }
  }

  if (signals.length === markets.length) {
    return { signals, signalsOrigin: 'live', signalsAsOf: asOf };
  }

  // 폴백: 목업 신호 (기존 page.tsx 의 변환 로직)
  const mockSignals = dailySignals.map(ds => {
    const market = markets.find(m => m.id === ds.market_id)!;
    return {
      market_code: market.code,
      market_name: market.name,
      score: ds.score,
      level: ds.level,
      contributors: ds.contributors,
      briefing: ds.briefing ?? undefined,
    };
  });
  return { signals: mockSignals, signalsOrigin: 'mock', signalsAsOf: '' };
}

// === 롤링 상관계수 (TASK T2-2) ===

function buildCorrelations(series: Map<string, Bar[]>): {
  correlations: Correlation[];
  correlationsOrigin: DataOrigin;
} {
  // 목업과 같은 (시장 × 지표) 쌍을 계산해 표 구조를 유지한다.
  const pairs = mockCorrelations.map(c => ({ market_id: c.market_id, indicator_id: c.indicator_id }));
  const now = new Date().toISOString();

  const computed: Correlation[] = [];
  let id = 1;

  for (const { market_id, indicator_id } of pairs) {
    const market = markets.find(m => m.id === market_id);
    const indicator = indicators.find(i => i.id === indicator_id);
    if (!market || !indicator) continue;

    const marketBars = series.get(MARKET_INDEX[market.code]);
    const indicatorBars = series.get(indicator.code);
    if (!marketBars || !indicatorBars) continue;

    // 90일 창: 각 시계열의 마지막 ~90개 관측치만 사용
    const coef = correlateBars(marketBars.slice(-90), indicatorBars.slice(-90));
    if (coef === null) continue;

    computed.push({
      id: id++,
      market_id,
      indicator_id,
      window: '90d',
      coef: Math.round(coef * 100) / 100,
      updated_at: now,
    });
  }

  // 4분의 3 이상 계산됐으면 실측으로 취급하고, 빠진 칸은 UI 가 '·' 로 표시한다.
  if (computed.length >= Math.ceil(pairs.length * 0.75)) {
    return { correlations: computed, correlationsOrigin: 'live' };
  }
  return { correlations: mockCorrelations, correlationsOrigin: 'mock' };
}

// === 밤사이 스냅샷 ===

function buildOvernight(series: Map<string, Bar[]>): DashboardData['overnight'] {
  const last = (code: string) => {
    const bars = series.get(code);
    return bars && bars.length > 0 ? bars[bars.length - 1] : null;
  };

  const spec: Array<{ code: string; label: string; unit: string; format: OvernightMetric['format'] }> = [
    { code: 'DGS10', label: '美 10년물', unit: '%', format: 'rate' },
    { code: 'NASDAQCOM', label: '나스닥 종가', unit: 'pt', format: 'index' },
    { code: 'WTI', label: 'WTI', unit: 'USD/bbl', format: 'price' },
    { code: 'XBR', label: '브렌트', unit: 'USD/bbl', format: 'price' },
    { code: 'USD/KRW', label: 'USD/KRW', unit: 'KRW', format: 'fx' },
    { code: 'USD/JPY', label: 'USD/JPY', unit: 'JPY', format: 'fx' },
    { code: 'DXY', label: '광의 달러지수', unit: 'pt', format: 'price' },
    // 나스닥 선물은 무료 소스가 없다. 실측 모드에서는 타일 자체를 내리는 것이
    // 일주일 묵은 목업 숫자를 옆에 두는 것보다 정직하다.
  ];

  const metrics: OvernightMetric[] = [];
  let date = '';
  for (const s of spec) {
    const bar = last(s.code);
    if (!bar) continue;
    metrics.push({ label: s.label, value: bar.close, unit: s.unit, format: s.format });
    if (bar.ts > date) date = bar.ts;
  }

  if (metrics.length >= 5) {
    return { date, metrics, origin: 'live' };
  }

  // 폴백: 목업 스냅샷 전체 (선물 포함)
  const m = overnightSnapshot;
  return {
    date: m.date,
    origin: 'mock',
    metrics: [
      { label: '美 10년물', value: m.us10y, unit: '%', format: 'rate' },
      { label: '나스닥 종가', value: m.nasdaq_close, unit: 'pt', format: 'index' },
      { label: '나스닥 선물', value: m.nasdaq_fut, unit: 'pt', format: 'index' },
      { label: 'WTI', value: m.wti, unit: 'USD/bbl', format: 'price' },
      { label: '브렌트', value: m.brent, unit: 'USD/bbl', format: 'price' },
      { label: 'USD/KRW', value: m.usdkrw, unit: 'KRW', format: 'fx' },
      { label: 'USD/JPY', value: m.usdjpy, unit: 'JPY', format: 'fx' },
      { label: '광의 달러지수', value: m.dxy, unit: 'pt', format: 'price' },
    ],
  };
}
