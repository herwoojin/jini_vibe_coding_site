// Netlify Background Function — DART 상장사 목록 준비
//
// 파일명의 "-background" 접미사가 백그라운드 함수로 만든다 (실행 상한 15분).
// 목록 준비는 3.4MB 다운로드 + 27MB 압축해제라 배포 환경에서 무료 티어 10초를
// 넘긴다. 라우트에서 after() 로 돌리면 그 제한을 그대로 물려받아(Next 문서:
// "after will run for the platform's default or configured max duration")
// 끝나지 못하고, 화면은 영영 "준비 중"에 머문다. 그래서 이쪽에서 돌린다.
import { getListedCompanies, WARM_ERROR } from '../../lib/data/corp-search';
import { storeSet } from '../../lib/ai/store';

const corpWarmBackground = async (): Promise<Response> => {
  try {
    console.log('[bg:corp-warm] 시작');
    const list = await getListedCompanies();
    // 지난 실패 기록을 지운다 — 남아 있으면 성공한 뒤에도 오류가 뜬다.
    await storeSet(WARM_ERROR, null);
    console.log(`[bg:corp-warm] 완료 — 상장사 ${list.length}개`);
    return new Response('ok', { status: 200 });
  } catch (err) {
    // 실패를 남기지 않으면 화면이 원인 없이 계속 기다리기만 한다.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[bg:corp-warm] 실패:', err);
    await storeSet(WARM_ERROR, { at: Date.now(), message }).catch(() => {});
    return new Response('error', { status: 500 });
  }
};

export default corpWarmBackground;
