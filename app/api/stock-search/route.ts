import { searchCompanies } from '@/lib/data/corp-search';

/** 종목명 검색 — DART 공식 상장사 목록에서 찾는다 (AI 추측 아님). */
export const dynamic = 'force-dynamic';

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
    return Response.json({ matches: await searchCompanies(q) });
  } catch (err) {
    console.error('[stock-search]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : '검색에 실패했습니다.', matches: [] },
      { status: 500 },
    );
  }
}
