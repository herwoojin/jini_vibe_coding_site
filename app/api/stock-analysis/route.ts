import { after } from 'next/server';
import { analyzeStock, type StockAnalysis } from '@/lib/ai/stock-research';
import { isKoreanCode, resolveKoreanSymbol, RateLimitedError } from '@/lib/data/symbol-resolve';
import { storeGet, storeSet } from '@/lib/ai/store';
import { NOTICES, type DataNotice } from '@/lib/ai/notices';

/**
 * 개별 종목 매수/매도 타이밍 분석.
 *
 * ⚠️ 분석은 그라운딩 검색 2회로 30~60초 걸린다(실측). 요청 안에서 끝내려 하면
 * 배포 환경의 함수 실행 제한(Netlify 무료 티어 10초)을 넘겨 게이트웨이가 HTML
 * 오류 페이지를 반환하고, 클라이언트에서 "Unexpected token '<'" 파싱 오류가 난다.
 * 그래서 응답 이후(after)에 백그라운드로 돌리고 클라이언트가 폴링해 받아간다.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** 배당 유니버스는 심볼이 이미 완성형이라 그대로 허용한다. */
const ALLOWED = new Set([
  '030200.KS', '015760.KS', '316140.KS', '086790.KS', '033780.KS', '005490.KS',
  '055550.KS', '105560.KS', '024110.KS', '017670.KS', '323410.KS', '005930.KS',
]);

/** 같은 종목을 10분 단위로 캐시한다 (연타·재조회로 호출이 폭증하지 않게). */
function cacheKey(symbol: string, now = new Date()): string {
  return `analysis:${symbol}#${Math.floor(now.getTime() / 600_000)}`;
}

const inflight = new Map<string, Promise<void>>();

function startAnalysis(key: string, symbol: string, name: string): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = (async () => {
    try {
      console.log(`[stock-analysis] 백그라운드 분석 시작 ${name}(${symbol})`);
      const { analysis, warning } = await analyzeStock(symbol, name);
      await storeSet(key, { analysis, warning });
      console.log(
        `[stock-analysis] 완료 ${name} — ${analysis.signal.signal} (${analysis.elapsedSec}초)`,
      );
    } catch (err) {
      // 실패도 기록해 폴링이 무한정 돌지 않게 한다.
      const message = err instanceof Error ? err.message : '분석에 실패했습니다.';
      const notices: DataNotice[] =
        err instanceof RateLimitedError
          ? [NOTICES.rateLimited()]
          : [NOTICES.analysisFailed(message)];
      await storeSet(key, { failed: true, error: message, notices });
      console.error(`[stock-analysis] 실패 ${name}:`, err);
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
}

type Stored =
  | { analysis: StockAnalysis; warning?: string }
  | { failed: true; error: string; notices: DataNotice[] };

export async function POST(request: Request) {
  try {
    const { symbol, name } = await request.json();

    if (typeof symbol !== 'string' || typeof name !== 'string' || !symbol || !name) {
      return Response.json({ error: '종목명 또는 티커가 필요합니다.' }, { status: 400 });
    }
    if (!process.env.GEMINI_KEY) {
      return Response.json(
        {
          error: 'Gemini API 키가 설정되지 않았습니다.',
          notices: [NOTICES.analysisFailed('GEMINI_KEY 미설정')],
        },
        { status: 503 },
      );
    }

    const raw = symbol.replace(/\.(KS|KQ)$/, '');
    if (!ALLOWED.has(symbol) && !isKoreanCode(raw)) {
      return Response.json({ error: '지원하지 않는 종목입니다.' }, { status: 400 });
    }

    // 코스피(.KS)/코스닥(.KQ) 중 실제 존재하는 쪽을 찾는다. 없으면 분석하지 않는다.
    let resolved = symbol;
    if (!ALLOWED.has(symbol)) {
      const found = await resolveKoreanSymbol(raw);
      if (!found) {
        return Response.json(
          {
            error:
              `종목코드 ${raw} 이(가) 실제로 존재하지 않아 분석을 중단했습니다. ` +
              `엉뚱한 회사를 분석하지 않기 위해 막았습니다.`,
            notices: [NOTICES.tickerUnverified([name])],
          },
          { status: 404 },
        );
      }
      resolved = found;
    }

    const key = cacheKey(resolved);
    const stored = await storeGet<Stored>(key);

    if (stored) {
      if ('failed' in stored) {
        return Response.json({ error: stored.error, notices: stored.notices }, { status: 500 });
      }
      return Response.json({ ...stored, pending: false });
    }

    // 아직 없으면 백그라운드로 시작하고 즉시 응답한다 (게이트웨이 타임아웃 회피).
    const job = startAnalysis(key, resolved, name);
    after(() => job);

    return Response.json({ pending: true });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return Response.json(
        { error: err.message, notices: [NOTICES.rateLimited()] },
        { status: 429 },
      );
    }
    console.error('[stock-analysis]', err);
    const message = err instanceof Error ? err.message : '분석에 실패했습니다.';
    return Response.json(
      { error: message, notices: [NOTICES.analysisFailed(message)] },
      { status: 500 },
    );
  }
}
