import type { DataSourceAdapter, Quote, Bar, SeriesOpts } from '../types';

export class KisAdapter implements DataSourceAdapter {
  id = 'kis';
  private appKey = process.env.KIS_APP_KEY || '';
  private appSecret = process.env.KIS_APP_SECRET || '';
  
  async fetchLatest(symbol: string): Promise<Quote> {
    if (!this.appKey || !this.appSecret) throw new Error('KIS keys are not set');
    
    // TODO: OAuth 토큰 발급 및 지수 조회 로직 구현
    return {
      symbol,
      value: 0,
      asOf: new Date().toISOString(),
    };
  }

  async fetchSeries(symbol: string, opts: SeriesOpts): Promise<Bar[]> {
    throw new Error('Method not implemented.');
  }

  async healthCheck(): Promise<boolean> {
    return !!this.appKey && !!this.appSecret;
  }
}
