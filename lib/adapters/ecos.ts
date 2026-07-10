import type { DataSourceAdapter, Quote, Bar, SeriesOpts } from '../types';

interface EcosRow {
  TIME: string; // 일별 주기에서는 'YYYYMMDD'
  DATA_VALUE: string;
}

/**
 * StatisticItemList API 로 직접 확인한 실제 코드 (2026-07 기준).
 * 환율은 FRED(DEXKOUS)에도 있지만 8일 지연이라 1일 지연인 ECOS 를 쓴다.
 */
const SYMBOL_MAP: Record<string, { statCode: string; itemCode: string }> = {
  KR3Y: { statCode: '817Y002', itemCode: '010200000' }, // 국고채(3년)
  BASE_KR: { statCode: '722Y001', itemCode: '0101000' }, // 한국은행 기준금리
  'USD/KRW': { statCode: '731Y001', itemCode: '0000001' }, // 원/미국달러(매매기준율)
  'USD/JPY': { statCode: '731Y002', itemCode: '0000002' }, // 일본엔/달러
  KOSPI: { statCode: '802Y001', itemCode: '0001000' }, // KOSPI지수
  KOSDAQ: { statCode: '802Y001', itemCode: '0089000' }, // KOSDAQ지수
};

// ECOS 는 오름차순으로만 주고 정렬 옵션이 없다. 최신값은 뒤에서 잘라야 한다.
const MAX_ROWS = 1000;

export class EcosAdapter implements DataSourceAdapter {
  id = 'ecos';
  private apiKey = process.env.ECOS_KEY || '';
  private baseUrl = 'https://ecos.bok.or.kr/api/StatisticSearch';

  constructor(private fetchInit: RequestInit = {}) {}

  private resolve(symbol: string) {
    const mapped = SYMBOL_MAP[symbol];
    if (!mapped) throw new Error(`ECOS: unknown symbol "${symbol}"`);
    return mapped;
  }

  /**
   * ECOS 는 인증 실패·데이터 없음도 HTTP 200 으로 응답하고 본문 RESULT 로만 알린다.
   * 따라서 res.ok 만으로는 성공을 판단할 수 없다.
   */
  private async request(
    symbol: string,
    from: string,
    to: string,
  ): Promise<EcosRow[]> {
    const { statCode, itemCode } = this.resolve(symbol);
    const url = [
      this.baseUrl,
      encodeURIComponent(this.apiKey),
      'json',
      'kr',
      '1',
      String(MAX_ROWS),
      statCode,
      'D',
      from,
      to,
      itemCode,
    ].join('/');

    const res = await fetch(url, this.fetchInit);
    if (!res.ok) throw new Error(`ECOS HTTP ${res.status}`);

    const json = await res.json();

    if (json.RESULT) {
      const { CODE, MESSAGE } = json.RESULT;
      if (CODE === 'INFO-200') return []; // 해당 기간에 데이터 없음 — 빈 배열로 취급
      throw new Error(`ECOS ${CODE}: ${MESSAGE}`);
    }

    return json.StatisticSearch?.row ?? [];
  }

  async fetchLatest(symbol: string): Promise<Quote> {
    if (!this.apiKey) throw new Error('ECOS_KEY is not set');

    const bars = await this.fetchSeries(symbol, { interval: '1day', outputsize: 10 });
    if (bars.length === 0) throw new Error(`ECOS ${symbol}: no observation`);

    const latest = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const changePct =
      prev && prev.close !== 0 ? ((latest.close - prev.close) / prev.close) * 100 : undefined;

    return { symbol, value: latest.close, asOf: latest.ts, changePct };
  }

  async fetchSeries(symbol: string, opts: SeriesOpts): Promise<Bar[]> {
    if (!this.apiKey) throw new Error('ECOS_KEY is not set');
    if (opts.interval !== '1day') {
      throw new Error(`ECOS serves daily series only, got "${opts.interval}"`);
    }

    const to = new Date();
    const from = opts.from
      ? new Date(opts.from)
      : // 영업일만 채워지므로 요청 개수의 2배쯤 되는 달력 일수를 잡는다.
        new Date(to.getTime() - (opts.outputsize ?? 30) * 2 * 86_400_000);

    const rows = await this.request(symbol, toEcosDate(from), toEcosDate(to));

    const bars = rows
      .map(r => ({ ts: toIsoDate(r.TIME), close: Number(r.DATA_VALUE) }))
      .filter(b => Number.isFinite(b.close));

    // 응답은 이미 오름차순이다. outputsize 는 "최신 N개"를 의미한다.
    return opts.outputsize ? bars.slice(-opts.outputsize) : bars;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const bars = await this.fetchSeries('BASE_KR', { interval: '1day', outputsize: 1 });
      return bars.length > 0;
    } catch {
      return false;
    }
  }
}

/** Date → 'YYYYMMDD' */
function toEcosDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' (FRED 어댑터와 동일한 형식) */
function toIsoDate(t: string): string {
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
}
