// MacroSignal — 6자리 국내 종목코드 → Yahoo 심볼 해석
//
// AI 가 알려준 종목코드를 그대로 믿지 않는다. 실제로 Yahoo 에 존재하는지 확인한 뒤에만
// 분석 대상으로 삼는다. 코스피(.KS)와 코스닥(.KQ)을 순서대로 시도한다.

const CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const ONE_DAY = 86_400;

/** 국내 종목코드 형식인가 (6자리 숫자) */
export function isKoreanCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/** 이미 완성된 Yahoo 심볼인가 */
export function isKoreanSymbol(symbol: string): boolean {
  return /^\d{6}\.(KS|KQ)$/.test(symbol);
}

/**
 * 6자리 코드를 실존하는 Yahoo 심볼로 바꾼다. 없으면 null.
 * 헤더를 붙이지 않는다 — 브라우저 UA 를 보내면 Yahoo 가 429 로 막는다(실측).
 */
export class RateLimitedError extends Error {
  constructor() {
    super('데이터 제공처(Yahoo)가 일시적으로 요청을 제한하고 있습니다. 잠시 후 다시 시도해 주세요.');
    this.name = 'RateLimitedError';
  }
}

export async function resolveKoreanSymbol(code: string): Promise<string | null> {
  if (!isKoreanCode(code)) return null;

  let rateLimited = false;

  for (const suffix of ['.KS', '.KQ']) {
    const symbol = `${code}${suffix}`;
    try {
      const res = await fetch(`${CHART}/${symbol}?range=5d&interval=1d`, {
        next: { revalidate: ONE_DAY },
      });
      // ⚠️ 429 를 "존재하지 않는 종목"으로 오판하면 멀쩡한 종목을 조용히 거부하게 된다.
      // 실제로 대조군(현대차)까지 429 로 막히는 상황을 겪었다.
      if (res.status === 429) {
        rateLimited = true;
        continue;
      }
      if (!res.ok) continue;
      const json = await res.json();
      if (json?.chart?.result?.[0]?.meta?.regularMarketPrice != null) return symbol;
    } catch {
      /* 다음 접미사 시도 */
    }
  }

  if (rateLimited) throw new RateLimitedError();
  return null;
}
