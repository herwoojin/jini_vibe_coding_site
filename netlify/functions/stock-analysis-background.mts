// Netlify Background Function — 개별 종목 매수/매도 타이밍 분석
//
// 파일명의 "-background" 접미사가 백그라운드 함수로 만든다 (실행 상한 15분).
// 일반 함수(무료 10초)로는 분석(30~60초)이 끝나지 않는다.
// 결과·실패 모두 저장소에 쓴다 (실패를 안 쓰면 화면이 무한정 폴링한다).
import { analyzeStock } from '../../lib/ai/stock-research';
import { storeSet } from '../../lib/ai/store';
import { NOTICES } from '../../lib/ai/notices';
import { RateLimitedError } from '../../lib/data/symbol-resolve';

const stockAnalysisBackground = async (req: Request): Promise<Response> => {
  let key = '';
  let name = '';
  try {
    const body = (await req.json()) as { key: string; symbol: string; name: string };
    key = body.key;
    name = body.name;
    if (!key || !body.symbol || !name) throw new Error('key/symbol/name 이 필요합니다');

    console.log(`[bg:stock-analysis] 시작 ${name}(${body.symbol})`);
    const { analysis, warning } = await analyzeStock(body.symbol, name);
    await storeSet(key, { analysis, warning });
    console.log(
      `[bg:stock-analysis] 완료 ${name} — ${analysis.signal.signal} (${analysis.elapsedSec}초)`,
    );
    return new Response('ok', { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '분석에 실패했습니다.';
    const notices =
      err instanceof RateLimitedError ? [NOTICES.rateLimited()] : [NOTICES.analysisFailed(message)];
    if (key) await storeSet(key, { failed: true, error: message, notices });
    console.error(`[bg:stock-analysis] 실패 ${name}:`, err);
    return new Response('error', { status: 500 });
  }
};

export default stockAnalysisBackground;
