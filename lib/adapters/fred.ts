import type { DataSourceAdapter, Quote, Bar, SeriesOpts } from '../types';

interface FredObservation {
  date: string;
  value: string;
}

/**
 * 지표 코드 → FRED series_id.
 * DGS10 처럼 코드가 곧 series_id 인 경우가 많아 매핑이 없으면 그대로 쓴다.
 */
const SERIES_ID: Record<string, string> = {
  WTI: 'DCOILWTICO',
  XBR: 'DCOILBRENTEU',
  NDX: 'NASDAQ100',
  SP500: 'SP500',
  DJIA: 'DJIA',
  VIX: 'VIXCLS',
  // ICE DXY 는 유료 라이선스라 무료 소스가 없다. 연준 광의 달러지수로 대체하고
  // UI 라벨도 '광의 달러지수' 로 바꿨다. 구성통화·기준연도가 다른 별개 지수다.
  DXY: 'DTWEXBGS',
};

export class FredAdapter implements DataSourceAdapter {
  id = 'fred';
  private apiKey = process.env.FRED_KEY || '';
  private baseUrl = 'https://api.stlouisfed.org/fred/series/observations';

  /**
   * fetchInit 으로 런타임별 캐싱 옵션을 주입한다.
   * Next.js 는 fetch 를 기본적으로 캐시하지 않으므로 호출 예산을 지키려면 필요하다.
   */
  constructor(private fetchInit: RequestInit = {}) {}

  // FRED 는 Authorization 헤더를 무시한다. api_key 쿼리 파라미터만 인증된다.
  private buildUrl(symbol: string, params: Record<string, string>): string {
    const qs = new URLSearchParams({
      series_id: SERIES_ID[symbol] ?? symbol,
      api_key: this.apiKey,
      file_type: 'json',
      ...params,
    });
    return `${this.baseUrl}?${qs}`;
  }

  private async request(url: string): Promise<FredObservation[]> {
    const res = await fetch(url, this.fetchInit);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`FRED ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    return json.observations ?? [];
  }

  async fetchLatest(symbol: string): Promise<Quote> {
    if (!this.apiKey) throw new Error('FRED_KEY is not set');

    // 휴장일은 value 가 "." 로 온다. 직전 유효값까지 필요하므로 여유 있게 받는다.
    const observations = await this.request(
      this.buildUrl(symbol, { sort_order: 'desc', limit: '10' }),
    );

    const valid = observations.filter(o => o.value !== '.');
    if (valid.length === 0) {
      throw new Error(`FRED ${symbol}: no valid observation in last 10 rows`);
    }

    const value = Number(valid[0].value);
    if (!Number.isFinite(value)) {
      throw new Error(`FRED ${symbol}: unparsable value "${valid[0].value}"`);
    }

    const prev = valid[1] ? Number(valid[1].value) : NaN;
    const changePct =
      Number.isFinite(prev) && prev !== 0 ? ((value - prev) / prev) * 100 : undefined;

    return { symbol, value, asOf: valid[0].date, changePct };
  }

  async fetchSeries(symbol: string, opts: SeriesOpts): Promise<Bar[]> {
    if (!this.apiKey) throw new Error('FRED_KEY is not set');
    if (opts.interval !== '1day') {
      throw new Error(`FRED serves daily series only, got "${opts.interval}"`);
    }

    // outputsize 로 최신 N개를 받으려면 desc 로 잘라야 한다.
    const descending = Boolean(opts.outputsize);
    const params: Record<string, string> = {
      sort_order: descending ? 'desc' : 'asc',
    };
    if (opts.from) params.observation_start = opts.from;
    if (opts.outputsize) params.limit = String(opts.outputsize);

    const observations = await this.request(this.buildUrl(symbol, params));

    const bars = observations
      .filter(o => o.value !== '.')
      .map(o => ({ ts: o.date, close: Number(o.value) }))
      .filter(b => Number.isFinite(b.close));

    // 호출자는 항상 시간 오름차순을 기대한다.
    return descending ? bars.reverse() : bars;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(
        this.buildUrl('DGS10', { limit: '1', sort_order: 'desc' }),
        this.fetchInit,
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
