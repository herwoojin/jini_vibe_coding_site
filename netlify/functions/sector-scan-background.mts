// Netlify Background Function — 주도주 섹터 스캔
//
// 파일명의 "-background" 접미사가 백그라운드 함수로 만든다 (실행 상한 15분).
// 일반 함수(무료 10초)로는 스캔(50~70초)이 끝나지 않아 반드시 이쪽에서 돌려야 한다.
// 결과는 저장소에 쓰고, 화면은 Next 라우트를 폴링해 가져간다.
import { scanLeadingSectors } from '../../lib/ai/sector-scan';
import { storeSet } from '../../lib/ai/store';

const sectorScanBackground = async (req: Request): Promise<Response> => {
  let key = '';
  try {
    ({ key } = (await req.json()) as { key: string });
    if (!key) throw new Error('key 가 필요합니다');

    console.log(`[bg:sector-scan] 시작 ${key}`);
    // 진단용 표식 — 긴 작업 전에 먼저 기록한다.
    // 이게 보이면 "함수는 실행됐고 Blobs 공유도 된다"가 증명되고,
    // 안 보이면 함수가 아예 안 돌거나 import 단계에서 죽은 것이다.
    await storeSet('sector:__debug', {
      stage: 'started',
      key,
      at: new Date().toISOString(),
      hasGeminiKey: Boolean(process.env.GEMINI_KEY),
    });

    const scan = await scanLeadingSectors();

    // 검색 실패(ungrounded) 결과는 캐시하지 않는다 — 빈 화면을 30분 고정시키게 된다.
    if (scan.ungrounded) {
      console.warn('[bg:sector-scan] 검색 근거 없음 — 저장하지 않음');
      return new Response('ungrounded', { status: 200 });
    }

    await storeSet(key, scan);
    await storeSet('sector:latest', scan);
    console.log(`[bg:sector-scan] 완료 — 섹터 ${scan.leading_sectors.length}개`);
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error(`[bg:sector-scan] 실패 ${key}:`, err);
    await storeSet('sector:__debug', {
      stage: 'failed',
      key,
      at: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    return new Response('error', { status: 500 });
  }
};

export default sectorScanBackground;
