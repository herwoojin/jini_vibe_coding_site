import { currentSlot, type Slot } from './slots';
import { analyzeWithGemini, type AiAnalysis } from './gemini';
import { storeGet, storeSet } from './store';
import { getDashboardData } from '../data/dashboard';

export interface SlottedAnalysis {
  analysis: AiAnalysis;
  /** 이 분석이 실제로 수행된 슬롯 (stale 이면 현재 슬롯보다 과거) */
  slot: Slot;
  /** true = 현재 슬롯 분석이 없어 직전 성공본을 보여주는 중 */
  stale: boolean;
}

const LATEST_KEY = 'latest';
const slotKeyOf = (s: Slot) => `slot:${s.key}`;

/** 같은 프로세스 안에서 동시 요청이 Gemini 를 중복 호출하지 않게 막는다. */
let inflight: Promise<SlottedAnalysis> | null = null;

/**
 * 현재 슬롯의 AI 분석을 반환한다.
 *
 * 1. 현재 슬롯 결과가 저장돼 있으면 그대로 (Gemini 호출 없음 — 슬롯당 1회 보장)
 * 2. 없으면 Gemini 1회 호출 → 슬롯 기록 + '마지막 성공본' 갱신
 * 3. 호출 실패(또는 키 미설정) 시 마지막 성공본을 원래 분석 시각과 함께 반환 (stale)
 * 4. 성공본이 하나도 없으면 null — 패널은 안내만 표시
 */
export async function getAiAnalysis(): Promise<SlottedAnalysis | null> {
  const slot = currentSlot();

  const cached = await storeGet<{ analysis: AiAnalysis; slot: Slot }>(slotKeyOf(slot));
  if (cached) return { ...cached, stale: false };

  if (process.env.GEMINI_KEY) {
    try {
      if (!inflight) {
        inflight = (async () => {
          console.log(`[ai] Gemini 호출 (슬롯 ${slot.key}) — 슬롯당 1번만 보여야 정상`);
          const dashboard = await getDashboardData();
          const analysis = await analyzeWithGemini(dashboard, slot.isDawn);
          const record = { analysis, slot };
          await storeSet(slotKeyOf(slot), record);
          await storeSet(LATEST_KEY, record);
          return { ...record, stale: false };
        })();
      }
      return await inflight;
    } catch (err) {
      console.error(`[ai] 슬롯 ${slot.key} 분석 실패 — 직전 성공본으로 폴백:`, err);
    } finally {
      inflight = null;
    }
  }

  // 폴백: 마지막 성공본 (실패는 저장하지 않으므로 다음 방문이 자동 재시도한다)
  const latest = await storeGet<{ analysis: AiAnalysis; slot: Slot }>(LATEST_KEY);
  if (latest) return { ...latest, stale: true };
  return null;
}
