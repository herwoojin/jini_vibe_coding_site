import { FredAdapter } from '../adapters/fred';
import { EcosAdapter } from '../adapters/ecos';
import { TwelveDataAdapter } from '../adapters/twelvedata';
import type { Bar, DataSourceAdapter } from '../types';

// 카드 스파크라인(30) + 상관계수 90d 창을 모두 감당하는 길이
export const SERIES_BARS = 100;

// Next.js 는 fetch 를 기본적으로 캐시하지 않는다. 무료 호출 예산을 지키려면 명시해야 한다.
// Twelve Data 는 분당 8콜 제한도 있어 캐시가 곧 생존 조건이다 (시간당 심볼당 1콜).
const ONE_HOUR = 3600;

/**
 * 지표 시계열을 병렬로 받아온다. 심볼마다 primary → backup 순으로 시도한다 (TRD 7).
 * 실패한 심볼은 맵에서 빠질 뿐 전체를 죽이지 않는다 — 호출부는 없으면 목업으로 강등한다.
 * 카드·신호엔진·상관계수·밤사이가 전부 이 맵 하나를 공유한다.
 */
export async function fetchAllSeries(): Promise<Map<string, Bar[]>> {
  const cacheInit: RequestInit = { next: { revalidate: ONE_HOUR } };

  const fred = process.env.FRED_KEY ? new FredAdapter(cacheInit) : null;
  const ecos = process.env.ECOS_KEY ? new EcosAdapter(cacheInit) : null;
  const twelve = process.env.TWELVEDATA_KEY ? new TwelveDataAdapter(cacheInit) : null;

  // 심볼 → 시도 순서. 환율은 당일 장중 값(twelvedata)을 우선하고 전일 종가(ecos)로 폴백한다.
  const chains: Array<{ symbol: string; adapters: Array<DataSourceAdapter | null> }> = [
    { symbol: 'DGS10', adapters: [fred] },
    { symbol: 'FEDFUNDS', adapters: [fred] },
    { symbol: 'NASDAQCOM', adapters: [fred] },
    { symbol: 'WTI', adapters: [fred] },
    { symbol: 'XBR', adapters: [fred] },
    { symbol: 'DXY', adapters: [fred] }, // 광의 달러지수(DTWEXBGS) — 무료 티어에 ICE DXY 없음
    // 미 증시 주도 흐름 (05:30 슬롯 분석용)
    { symbol: 'NDX', adapters: [fred] },
    { symbol: 'SP500', adapters: [fred] },
    { symbol: 'DJIA', adapters: [fred] },
    { symbol: 'VIX', adapters: [fred] },
    { symbol: 'KR3Y', adapters: [ecos] },
    { symbol: 'BASE_KR', adapters: [ecos] },
    { symbol: 'USD/KRW', adapters: [twelve, ecos] },
    { symbol: 'USD/JPY', adapters: [twelve, ecos] },
    { symbol: 'KOSPI', adapters: [ecos] },
    { symbol: 'KOSDAQ', adapters: [ecos] },
  ];

  const results = await Promise.all(
    chains.map(async ({ symbol, adapters }) => {
      for (const adapter of adapters) {
        if (!adapter) continue;
        try {
          const bars = await adapter.fetchSeries(symbol, {
            interval: '1day',
            outputsize: SERIES_BARS,
          });
          if (bars.length >= 2) return [symbol, bars] as const;
        } catch (err) {
          console.error(`[series] ${adapter.id} ${symbol} 조회 실패:`, err);
        }
      }
      return null;
    }),
  );

  return new Map(results.filter((r): r is readonly [string, Bar[]] => r !== null));
}
