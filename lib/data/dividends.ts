import { fetchYahoo } from './yahoo';
import { fetchLatestDartDividend } from './dart';
import { analyzeDividendStock, type DividendStock } from '../engine/dividend';

/**
 * 배당주 유니버스 — 국내 대표 배당 종목.
 * 전 종목 Yahoo Finance 에서 배당 이력 수신이 확인된 심볼만 등록한다.
 * 데이터를 못 받은 종목은 목록에서 조용히 빠지며, 추정치로 채우지 않는다.
 */
const UNIVERSE: { symbol: string; name: string }[] = [
  { symbol: '030200.KS', name: 'KT' },
  { symbol: '015760.KS', name: '한국전력' },
  { symbol: '316140.KS', name: '우리금융지주' },
  { symbol: '086790.KS', name: '하나금융지주' },
  { symbol: '033780.KS', name: 'KT&G' },
  { symbol: '005490.KS', name: 'POSCO홀딩스' },
  { symbol: '055550.KS', name: '신한지주' },
  { symbol: '105560.KS', name: 'KB금융' },
  { symbol: '024110.KS', name: '기업은행' },
  { symbol: '017670.KS', name: 'SK텔레콤' },
  { symbol: '323410.KS', name: '카카오뱅크' },
  { symbol: '005930.KS', name: '삼성전자' },
];

export interface DividendUniverse {
  stocks: DividendStock[];
  /** 데이터 기준일 (가장 최근 종가일) */
  asOf: string;
  /** 조회 실패로 제외된 종목 수 — 숨기지 않고 UI 에 알린다 */
  failed: number;
}

/**
 * Yahoo 는 병렬 요청을 429 로 차단하고, 한 번 걸리면 수십 초 동안 유지된다 (실측).
 * 순차 조회 + 넉넉한 간격이 필수다. 하루 1회만 도는 경로라 총 소요는 문제되지 않는다.
 */
const REQUEST_GAP_MS = 700;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * 유니버스를 순차 조회해 배당 분석을 만든다.
 * 각 요청은 24시간 fetch 캐시이고 결과도 하루 단위로 저장되므로,
 * 이 함수의 실제 네트워크 비용은 하루 1회만 발생한다 (요청 사양).
 */
export async function fetchDividendUniverse(): Promise<DividendUniverse | null> {
  const results: (DividendStock | null)[] = [];

  for (const { symbol, name } of UNIVERSE) {
    // 하루 1회만 도는 경로이므로 fetch 캐시를 꺼서 항상 최신 종가를 받는다.
    const quote = await fetchYahoo(symbol, '3y', { noStore: true });
    if (!quote) {
      results.push(null);
      await sleep(REQUEST_GAP_MS);
      continue;
    }
    // 공시(DART) 배당성향 — 실패해도 종목은 유지한다 (Yahoo 실측만으로도 유효).
    const dart = await fetchLatestDartDividend(symbol);
    results.push(analyzeDividendStock(name, quote, dart));
    await sleep(REQUEST_GAP_MS);
  }

  const stocks = results.filter((s): s is DividendStock => s !== null);
  if (stocks.length === 0) return null;

  // 배당수익률 내림차순
  stocks.sort((a, b) => b.yieldPct - a.yieldPct);

  const asOf = stocks.reduce((max, s) => (s.priceAsOf > max ? s.priceAsOf : max), '');
  return { stocks, asOf, failed: UNIVERSE.length - stocks.length };
}
