// MacroSignal — 배당주 분석 엔진
//
// ⚠️ 돈에 관한 정보이므로 "실측 / 추정 / 규칙계산"을 타입 수준에서 구분한다.
//   measured  : 외부 API 가 실제로 준 값 (종가, 지급 완료된 배당금·배당락일)
//   estimated : 과거 패턴에서 유추한 값 (다음 배당락일) — UI 에 반드시 '추정' 표기
//   rule      : 변동성 기반 기계적 계산 (진입·손절·익절) — 예측이 아니라 규칙의 출력
// 어느 것도 확정 공시가 아니며, 추정을 실측처럼 보이게 하지 않는다.
import type { YahooBar, YahooDividend, YahooQuote } from '../data/yahoo';

export type DividendFrequency = '분기' | '반기' | '연간' | '불규칙';

export interface DividendPlan {
  /** 규칙 계산: 진입 기준가 (최근 종가) */
  entry: number;
  /** 규칙 계산: 손절가 (진입가 − 2×ATR) */
  stop: number;
  /** 규칙 계산: 익절가 (진입가 + 3×ATR) */
  target: number;
  /** 손절까지 하락률 (%) */
  stopPct: number;
  /** 익절까지 상승률 (%) */
  targetPct: number;
  /** ATR(14) — 하루 평균 변동폭 */
  atr: number;
}

export interface DividendScenario {
  /** 최소수익: 주가 변동 없이 배당만 수령 (%) */
  minimum: number;
  /** 적정수익: 배당 + 익절가 도달 (%) */
  fair: number;
  /** 손절 시 손실 (%, 음수) — 위험을 숨기지 않는다 */
  downside: number;
}

export interface DividendStock {
  symbol: string;
  name: string;
  /** 실측: 최근 종가 */
  price: number;
  /** 실측: 종가 기준일 */
  priceAsOf: string;
  /** 실측: 최근 12개월 지급 배당 합계 (주당) */
  ttmDividend: number;
  /** 실측: TTM 배당수익률 (%) — 실제 지급액 기준, 예상 배당이 아님 */
  yieldPct: number;
  /** 실측: 지급 완료된 마지막 배당락일 */
  lastExDate: string;
  /** 실측: 마지막 주당 배당금 */
  lastAmount: number;
  /** 실측: 연속 배당 지급 연수 */
  consecutiveYears: number;
  /** 실측: 데이터 구간 내 배당 지급 횟수 */
  payoutCount: number;
  /** 실측: 직전 동기 대비 배당 증감률 (%) — 산출 불가 시 null */
  growthPct: number | null;
  /** 추정: 배당 주기 (과거 간격에서 판별) */
  frequency: DividendFrequency;
  /** 추정: 다음 배당락일 (과거 패턴 기반, 확정 공시 아님) */
  nextExDateEst: string | null;
  /** 추정: 배당을 받으려면 이 날까지 매수 (배당락일 직전 영업일) */
  buyByEst: string | null;
  /** 추정 신뢰도 — 과거 간격의 일관성 */
  estConfidence: '높음' | '중간' | '낮음';
  /** 규칙 계산 */
  plan: DividendPlan;
  scenario: DividendScenario;
}

const DAY_MS = 86_400_000;

/** ATR(14) — 변동성. 봉이 부족하면 종가 기준 단순 변동폭으로 대체한다. */
export function atr14(bars: YahooBar[]): number {
  const window = bars.slice(-15);
  if (window.length < 2) return 0;

  const trs: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const prevClose = window[i - 1].close;
    const { high, low } = window[i];
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trs.reduce((s, v) => s + v, 0) / trs.length;
}

/**
 * 배당 주기와 "배당이 나오는 달" 판별.
 *
 * ⚠️ 간격(일) 기반 날짜 예측은 국내 종목에 쓸 수 없다. 실측한 배당락일 간격은
 * KT 기준 92·91·92·153·29·123·98·112·91·63일로 크게 흔들린다 — 2024년 배당기준일
 * 제도 변경과 결산배당·분기배당 혼재 때문이다. 반면 '몇 월에 주는가'는 안정적이다
 * (KB금융: 2·5·8·11월). 그래서 월 패턴으로 추정하고, 일자는 그 달의 과거 평균일을 쓴다.
 */
function detectPattern(divs: YahooDividend[], now: Date) {
  const perYearCount = (() => {
    const cutoff = now.getTime() - 365 * DAY_MS;
    return divs.filter(d => Date.parse(d.exDate) >= cutoff).length;
  })();

  let frequency: DividendFrequency = '불규칙';
  if (perYearCount >= 4) frequency = '분기';
  else if (perYearCount === 2 || perYearCount === 3) frequency = '반기';
  else if (perYearCount === 1) frequency = '연간';

  // 최근 24개월의 배당 월 → 이 종목이 배당을 주는 달
  const recent = divs.filter(d => Date.parse(d.exDate) >= now.getTime() - 730 * DAY_MS);
  const byMonth = new Map<number, number[]>(); // 월 → 일자들
  for (const d of recent) {
    const [, m, day] = d.exDate.split('-').map(Number);
    byMonth.set(m, [...(byMonth.get(m) ?? []), day]);
  }

  // 작년과 올해 모두 같은 달에 준 적이 있으면 패턴이 반복된 것으로 본다.
  const thisYear = now.getUTCFullYear();
  const monthsWithRepeat = [...byMonth.keys()].filter(m => {
    const years = new Set(
      recent.filter(d => Number(d.exDate.slice(5, 7)) === m).map(d => Number(d.exDate.slice(0, 4))),
    );
    return years.size >= 2 || years.has(thisYear);
  });

  const confidence: DividendStock['estConfidence'] =
    frequency === '불규칙' || byMonth.size === 0
      ? '낮음'
      : monthsWithRepeat.length >= Math.max(1, byMonth.size - 1)
        ? '중간' // 월 패턴은 반복되지만 일자는 해마다 달라 '높음'을 주지 않는다
        : '낮음';

  return { frequency, byMonth, confidence };
}

/** 배당을 주는 달들 중 오늘 이후 가장 가까운 (월, 일)을 찾는다. */
function nextFromMonthPattern(byMonth: Map<number, number[]>, now: Date): Date | null {
  if (byMonth.size === 0) return null;

  const candidates: Date[] = [];
  for (const [month, days] of byMonth) {
    // 그 달의 과거 배당락일 평균 일자 (해마다 다르므로 대표값을 쓴다)
    const avgDay = Math.round(days.reduce((s, d) => s + d, 0) / days.length);
    for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      const d = new Date(Date.UTC(year, month - 1, Math.min(avgDay, 28)));
      if (d.getTime() > now.getTime()) candidates.push(d);
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0];
}

/** 주말이면 직전 금요일로 당긴다 (공휴일까지는 알 수 없으므로 UI 에 '추정'으로 표기) */
function prevBusinessDay(date: Date): Date {
  const d = new Date(date);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** 연속 배당 지급 연수 (올해 포함 여부와 무관하게, 끊긴 해가 나올 때까지) */
function consecutiveYears(divs: YahooDividend[]): number {
  const years = new Set(divs.map(d => Number(d.exDate.slice(0, 4))));
  if (years.size === 0) return 0;
  const latest = Math.max(...years);
  let n = 0;
  for (let y = latest; years.has(y); y--) n++;
  return n;
}

/**
 * 종목 하나의 배당 분석을 만든다.
 * 배당 이력이 없으면 null — 배당주 목록에 넣지 않는다.
 */
export function analyzeDividendStock(
  name: string,
  quote: YahooQuote,
  now: Date = new Date(),
): DividendStock | null {
  const { dividends: divs, bars, price } = quote;
  if (divs.length === 0 || price <= 0) return null;

  // --- 실측 ---
  const cutoff = now.getTime() - 365 * DAY_MS;
  const ttm = divs.filter(d => Date.parse(d.exDate) >= cutoff);
  const ttmDividend = ttm.reduce((s, d) => s + d.amount, 0);
  const last = divs[divs.length - 1];

  const { frequency, byMonth, confidence } = detectPattern(divs, now);

  // 배당 성장률: 순번이 아니라 '작년 같은 달'과 비교한다.
  // 연간→분기 전환 종목(예: 기업은행)을 순번으로 비교하면 분기 배당과 연간 배당을
  // 맞대어 -80% 같은 허수가 나온다.
  const lastMonth = Number(last.exDate.slice(5, 7));
  const lastYear = Number(last.exDate.slice(0, 4));
  const priorSameMonth = divs.find(
    d => Number(d.exDate.slice(5, 7)) === lastMonth && Number(d.exDate.slice(0, 4)) === lastYear - 1,
  );
  const growthPct =
    priorSameMonth && priorSameMonth.amount > 0
      ? ((last.amount - priorSameMonth.amount) / priorSameMonth.amount) * 100
      : null;

  // --- 추정: 다음 배당락일 (월 패턴 기반) ---
  let nextExDateEst: string | null = null;
  let buyByEst: string | null = null;
  const nextDate = nextFromMonthPattern(byMonth, now);
  if (nextDate) {
    const next = prevBusinessDay(nextDate);
    nextExDateEst = next.toISOString().slice(0, 10);
    // 배당락일에는 이미 권리가 사라진다 → 그 직전 영업일까지 매수해야 한다.
    buyByEst = prevBusinessDay(new Date(next.getTime() - DAY_MS)).toISOString().slice(0, 10);
  }

  // --- 규칙 계산: 진입 · 손절 · 익절 ---
  const atr = atr14(bars);
  const entry = price;
  // ATR 을 못 구하면 임의 수치를 만들지 않고 종가 대비 고정 비율(5%/8%)을 쓴다.
  const stop = atr > 0 ? entry - 2 * atr : entry * 0.95;
  const target = atr > 0 ? entry + 3 * atr : entry * 1.08;
  const stopPct = ((stop - entry) / entry) * 100;
  const targetPct = ((target - entry) / entry) * 100;

  const yieldPct = (ttmDividend / price) * 100;

  return {
    symbol: quote.symbol,
    name,
    price,
    priceAsOf: quote.asOf,
    ttmDividend,
    yieldPct,
    lastExDate: last.exDate,
    lastAmount: last.amount,
    consecutiveYears: consecutiveYears(divs),
    payoutCount: divs.length,
    growthPct,
    frequency,
    nextExDateEst,
    buyByEst,
    estConfidence: confidence,
    plan: { entry, stop, target, stopPct, targetPct, atr },
    scenario: {
      // 최소: 주가가 그대로여도 받는 배당 (TTM 기준)
      minimum: yieldPct,
      // 적정: 배당 + 익절가 도달
      fair: yieldPct + targetPct,
      // 위험: 손절 도달 시 (배당 수령 전 이탈 가정 → 배당 미반영)
      downside: stopPct,
    },
  };
}
