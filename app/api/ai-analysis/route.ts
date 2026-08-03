/**
 * GET /api/ai-analysis
 *
 * 클라이언트 폴링용 엔드포인트.
 * - 200 + { status: 'ready', data } — 분석 완료
 * - 202 + { status: 'generating' }  — 생성 진행 중
 * - 503 + { status: 'error', message } — 생성 불가 (키 미설정 등)
 */
import { readAnalysis, generateIfMissing } from '@/lib/ai/analysis';
import { currentSlot } from '@/lib/ai/slots';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const slot = currentSlot();
  const data = await readAnalysis(slot);

  if (data) {
    return NextResponse.json({ status: 'ready', data });
  }

  if (!process.env.GEMINI_KEY) {
    return NextResponse.json(
      { status: 'error', message: 'GEMINI_KEY가 설정되지 않았습니다.' },
      { status: 503 },
    );
  }

  // 생성이 아직 시작되지 않았으면 트리거 (이미 inflight 이면 중복 호출 안 됨)
  generateIfMissing(slot).catch((err) => {
    console.error('[api/ai-analysis] 백그라운드 생성 실패:', err);
  });

  return NextResponse.json({ status: 'generating' }, { status: 202 });
}
