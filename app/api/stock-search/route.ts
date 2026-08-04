import { after } from 'next/server';
import {
  searchCompanies,
  isReady,
  warmListedCompanies,
  WARM_FLAG,
  WARM_ERROR,
  WARM_TTL_MS,
  type WarmError,
} from '@/lib/data/corp-search';
import { storeGet, storeSet } from '@/lib/ai/store';
import { triggerBackground } from '@/lib/ai/background';

/** 종목명 검색 — DART 공식 상장사 목록에서 찾는다 (AI 추측 아님). */
export const dynamic = 'force-dynamic';

/**
 * 목록 준비를 시작시킨다 — TTL 안에서는 한 번만.
 *
 * ⚠️ 준비 작업을 after() 로 돌리면 안 된다. after() 는 라우트의 함수 실행
 * 제한을 그대로 물려받아(Netlify 무료 10초) 3.4MB 다운로드 + 27MB 압축해제가
 * 끝나기 전에 끊긴다. 그러면 저장소에 아무것도 안 남아 다음 요청도 똑같이
 * 처음부터 시작하고, 화면은 영영 "준비 중"이 된다(실측).
 */
async function ensureWarming(): Promise<void> {
  const startedAt = await storeGet<number>(WARM_FLAG);
  if (startedAt && Date.now() - startedAt < WARM_TTL_MS) return; // 이미 도는 중

  await storeSet(WARM_FLAG, Date.now());

  const handed = await triggerBackground('corp-warm-background', {});
  if (!handed) {
    // 로컬 개발 등 — 실행 제한이 없으니 인라인으로 돌린다.
    const job = warmListedCompanies();
    after(() => job);
  }
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 1) return Response.json({ matches: [] });

  if (!process.env.DART_KEY) {
    return Response.json(
      { error: 'DART_KEY 가 설정되지 않아 종목 검색을 사용할 수 없습니다.', matches: [] },
      { status: 503 },
    );
  }

  try {
    if (!(await isReady())) {
      // 직전 준비가 실패했다면 기다리게 두지 말고 이유를 알린다.
      const failure = await storeGet<WarmError>(WARM_ERROR);
      if (failure && Date.now() - failure.at < WARM_TTL_MS) {
        return Response.json(
          { error: `상장사 목록을 불러오지 못했습니다 — ${failure.message}`, matches: [] },
          { status: 503 },
        );
      }

      await ensureWarming();
      return Response.json({ matches: [], preparing: true });
    }
    return Response.json({ matches: await searchCompanies(q) });
  } catch (err) {
    console.error('[stock-search]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : '검색에 실패했습니다.', matches: [] },
      { status: 500 },
    );
  }
}
