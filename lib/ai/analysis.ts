import { unstable_cache } from 'next/cache';
import { currentSlot, type Slot } from './slots';
import { analyzeWithGemini, type AiAnalysis } from './gemini';
import { getDashboardData } from '../data/dashboard';

export interface SlottedAnalysis {
  analysis: AiAnalysis;
  slot: Slot;
}

/**
 * 슬롯 키(예: "2026-07-10#12:00")가 캐시 키의 일부가 되므로,
 * 같은 슬롯에서는 방문자가 몇 명이든 Gemini 가 정확히 1회만 호출되고
 * 이후에는 캐시된 결과가 재사용된다. revalidate: false → 슬롯 결과는 영구 보존.
 * 호출이 실패하면 예외가 나가고 실패는 캐시되지 않는다 — 다음 방문자가 재시도한다.
 */
const cachedAnalysis = unstable_cache(
  async (slotKey: string): Promise<AiAnalysis> => {
    console.log(`[ai] Gemini 호출 (슬롯 ${slotKey}) — 이 로그는 슬롯당 1번만 보여야 정상`);
    const dashboard = await getDashboardData();
    return analyzeWithGemini(dashboard);
  },
  ['gemini-slot-analysis'],
  { revalidate: false },
);

/**
 * 현재 슬롯의 AI 분석. GEMINI_KEY 미설정 또는 호출 실패 시 null —
 * 대시보드의 다른 섹션은 영향받지 않는다.
 */
export async function getAiAnalysis(): Promise<SlottedAnalysis | null> {
  if (!process.env.GEMINI_KEY) return null;

  const slot = currentSlot();
  try {
    const analysis = await cachedAnalysis(slot.key);
    return { analysis, slot };
  } catch (err) {
    console.error(`[ai] 슬롯 ${slot.key} 분석 실패:`, err);
    return null;
  }
}
