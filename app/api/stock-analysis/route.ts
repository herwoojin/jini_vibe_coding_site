import { analyzeStock } from '@/lib/ai/stock-research';

/**
 * 개별 종목 매수/매도 타이밍 분석 (사용자가 버튼을 눌렀을 때만 실행).
 *
 * 페이지 로드 시 자동 실행하지 않는다: 그라운딩 검색이 15~40초 걸리고
 * Gemini 호출 비용이 들기 때문에, 명시적 요청에만 응답한다.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 분석 대상 화이트리스트 — 임의 심볼로 API 를 남용하지 못하게 한다. */
const ALLOWED = new Set([
  '030200.KS', '015760.KS', '316140.KS', '086790.KS', '033780.KS', '005490.KS',
  '055550.KS', '105560.KS', '024110.KS', '017670.KS', '323410.KS', '005930.KS',
]);

export async function POST(request: Request) {
  try {
    const { symbol, name } = await request.json();

    if (typeof symbol !== 'string' || typeof name !== 'string' || !symbol || !name) {
      return Response.json({ error: '종목명 또는 티커가 필요합니다.' }, { status: 400 });
    }
    if (!ALLOWED.has(symbol)) {
      return Response.json({ error: '지원하지 않는 종목입니다.' }, { status: 400 });
    }
    if (!process.env.GEMINI_KEY) {
      return Response.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 503 });
    }

    // 그라운딩 검색이 길어질 수 있어 상한을 둔다 (플랫폼 타임아웃보다 먼저 끊는다).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);

    try {
      const { analysis, warning } = await analyzeStock(symbol, name, controller.signal);
      return Response.json({ analysis, warning });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '분석에 실패했습니다.';
    console.error('[stock-analysis]', err);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return Response.json(
      { error: isAbort ? '분석 시간이 초과되었습니다. 다시 시도해 주세요.' : message },
      { status: isAbort ? 504 : 500 },
    );
  }
}
