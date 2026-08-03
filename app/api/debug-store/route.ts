import { storeGet } from '@/lib/ai/store';

/** 진단용(임시) — 백그라운드 함수가 저장소에 남긴 표식을 읽는다. */
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    sectorDebug: await storeGet('sector:__debug'),
    hasGeminiKey: Boolean(process.env.GEMINI_KEY),
    onNetlify: Boolean(process.env.NETLIFY),
    siteUrl: process.env.URL ?? null,
  });
}
