import type { DataSourceAdapter, Quote, Bar, SeriesOpts } from '../types';

/**
 * Twelve Data 무료(basic) 티어에서 실측 확인된 것 (2026-07):
 * - FX(USD/KRW, USD/JPY): 당일 장중 값 제공 ✅
 * - WTI/브렌트: Grow 플랜 전용 ❌ / ICE DXY: 심볼 자체가 없음 ❌
 * - 한도: 8크레딧/분, 800/일 — 에러는 HTTP 200 + {"status":"error"} 로 온다.
 */
export class TwelveDataAdapter implements DataSourceAdapter {
  id = 'twelvedata';
  private apiKey = process.env.TWELVEDATA_KEY || '';
  private baseUrl = 'https://api.twelvedata.com';

  constructor(private fetchInit: RequestInit = {}) {}

  /** 에러도 HTTP 200 으로 오므로 본문 status 를 반드시 검사한다. */
  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams({ ...params, apikey: this.apiKey });
    const res = await fetch(`${this.baseUrl}/${path}?${qs}`, this.fetchInit);
    if (!res.ok) throw new Error(`TwelveData HTTP ${res.status}`);

    const json = await res.json();
    if (json.status === 'error' || (json.code && json.code >= 400)) {
      throw new Error(`TwelveData ${json.code}: ${String(json.message).slice(0, 140)}`);
    }
    return json as T;
  }

  async fetchLatest(symbol: string): Promise<Quote> {
    if (!this.apiKey) throw new Error('TWELVEDATA_KEY is not set');

    const q = await this.request<{
      close: string;
      datetime: string;
      percent_change?: string;
    }>('quote', { symbol });

    const value = Number(q.close);
    if (!Number.isFinite(value)) {
      throw new Error(`TwelveData ${symbol}: unparsable close "${q.close}"`);
    }
    const pct = Number(q.percent_change);

    return {
      symbol,
      value,
      asOf: q.datetime,
      changePct: Number.isFinite(pct) ? pct : undefined,
    };
  }

  async fetchSeries(symbol: string, opts: SeriesOpts): Promise<Bar[]> {
    if (!this.apiKey) throw new Error('TWELVEDATA_KEY is not set');

    const json = await this.request<{
      values?: Array<{ datetime: string; close: string }>;
    }>('time_series', {
      symbol,
      interval: opts.interval === '1day' ? '1day' : opts.interval,
      outputsize: String(opts.outputsize ?? 100),
      ...(opts.from ? { start_date: opts.from } : {}),
    });

    const values = json.values ?? [];

    // 응답은 최신순(내림차순)이다. 호출자는 항상 시간 오름차순을 기대한다.
    return values
      .map(v => ({ ts: v.datetime, close: Number(v.close) }))
      .filter(b => Number.isFinite(b.close))
      .reverse();
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await this.request('api_usage', {});
      return true;
    } catch {
      return false;
    }
  }
}
