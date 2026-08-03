// MacroSignal — Yahoo Finance 어댑터 (키 불필요)
//
// 공식 문서화된 API 가 아니므로 실패를 항상 감안한다. 실패 시 호출부는 해당 종목을
// 목록에서 제외하며, 절대 추정치로 채우지 않는다 (돈에 관한 정보이므로).
//
// 제공: 전일 종가, OHLC 시계열, 실제 지급된 배당 이력(배당락일 + 주당 금액).
// 미제공: 미래 배당락일 — quoteSummary 는 인증(crumb)을 요구해 막혀 있다.

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** 배당 정보는 하루 1회만 갱신한다 (요청 사양). */
export const ONE_DAY = 86_400;

export interface YahooBar {
  ts: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface YahooDividend {
  /** 배당락일 (실제 확정된 과거 날짜) */
  exDate: string;
  /** 주당 배당금 */
  amount: number;
}

export interface YahooQuote {
  symbol: string;
  currency: string;
  /** 가장 최근 종가 */
  price: number;
  /** 종가 기준일 */
  asOf: string;
  bars: YahooBar[];
  dividends: YahooDividend[];
}

function toDate(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

/**
 * 시세 + 배당 이력을 한 번에 받는다.
 * @param range 예: '2y' (배당 주기 판별에 최소 2년 권장)
 */
export async function fetchYahoo(
  symbol: string,
  range = '2y',
  opts: { noStore?: boolean } = {},
): Promise<YahooQuote | null> {
  const url = `${BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=div`;

  try {
    // 헤더를 붙이지 않는다. 브라우저 User-Agent 를 보내면 Yahoo 가 봇으로 보고
    // 429 로 차단하지만, 기본 런타임 UA 는 통과한다 (실측 확인).
    //
    // ⚠️ noStore: 하루 1회 갱신 경로에서는 fetch 캐시를 반드시 꺼야 한다.
    // 저장소(하루 단위)와 fetch(24시간)가 이중으로 캐시되면, 갱신 시각이 조금만
    // 어긋나도 "새로 받은" 데이터가 실은 어제 응답이라 날짜가 멈춘 것처럼 보인다.
    const res = await fetch(
      url,
      opts.noStore ? { cache: 'no-store' } : { next: { revalidate: ONE_DAY } },
    );
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(json?.chart?.error?.description ?? 'empty result');

    const ts: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const bars: YahooBar[] = [];

    for (let i = 0; i < ts.length; i++) {
      const [o, h, l, c] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
      // 휴장일은 null 로 온다 — 값이 없는 날은 버린다 (0 으로 채우지 않는다).
      if ([o, h, l, c].every(v => typeof v === 'number' && Number.isFinite(v))) {
        bars.push({ ts: toDate(ts[i]), open: o, high: h, low: l, close: c });
      }
    }
    if (bars.length === 0) throw new Error('no valid bars');

    const rawDivs = result.events?.dividends ?? {};
    const dividends: YahooDividend[] = Object.entries(rawDivs)
      .map(([epoch, v]) => ({
        exDate: toDate(Number(epoch)),
        amount: Number((v as { amount: number }).amount),
      }))
      .filter(d => Number.isFinite(d.amount) && d.amount > 0)
      .sort((a, b) => a.exDate.localeCompare(b.exDate));

    const last = bars[bars.length - 1];
    return {
      symbol,
      currency: result.meta?.currency ?? '',
      price: last.close,
      asOf: last.ts,
      bars,
      dividends,
    };
  } catch (err) {
    console.error(`[yahoo] ${symbol} 조회 실패:`, err);
    return null;
  }
}
