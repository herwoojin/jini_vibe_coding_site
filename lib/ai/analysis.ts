import { currentSlot, type Slot } from './slots';
import { analyzeWithGemini, type AiAnalysis } from './gemini';
import { storeGet, storeSet } from './store';
import { getDashboardData, type DashboardData } from '../data/dashboard';
import { fetchSectorSnapshot, type SectorSnapshot } from '../data/sectors';

export interface SlottedAnalysis {
  analysis: AiAnalysis;
  /** 이 분석이 실제로 수행된 슬롯 (stale 이면 현재 슬롯보다 과거) */
  slot: Slot;
  /** 밤사이 미 섹터 등락 스냅샷 (05:30 슬롯에서만) */
  sectors?: SectorSnapshot | null;
  /** true = 현재 슬롯 분석이 아직 없어 직전 성공본을 보여주는 중 */
  stale: boolean;
}

type Record_ = { analysis: AiAnalysis; slot: Slot; sectors?: SectorSnapshot | null };

const LATEST_KEY = 'latest';
const slotKeyOf = (s: Slot) => `slot:${s.key}`;

/** 같은 프로세스에서 동시 요청이 Gemini 를 중복 호출하지 않게 막는다. */
let inflight: Promise<void> | null = null;

/**
 * 저장소만 읽어 현재 슬롯 분석을 반환한다 (Gemini 호출 없음 → 항상 빠르다).
 * - 현재 슬롯 결과가 있으면 그대로 (stale=false)
 * - 없으면 마지막 성공본을 stale 로 (직전 분석 유지)
 * - 아무것도 없으면 null
 *
 * 페이지는 이 함수만 await 하므로 렌더가 절대 18초씩 걸리지 않는다.
 * 실제 생성은 generateIfMissing() 이 응답 이후(after)에 수행한다.
 */
export async function readAnalysis(slot: Slot = currentSlot()): Promise<SlottedAnalysis | null> {
  const current = await storeGet<Record_>(slotKeyOf(slot));
  if (current) return { ...current, stale: false };

  const latest = await storeGet<Record_>(LATEST_KEY);
  if (latest) return { ...latest, stale: true };
  return null;
}

/** 현재 슬롯 분석이 필요한가? (없고, 키가 있을 때만 생성 대상) */
export async function needsGeneration(slot: Slot = currentSlot()): Promise<boolean> {
  if (!process.env.GEMINI_KEY) return false;
  return (await storeGet<Record_>(slotKeyOf(slot))) === null;
}

/**
 * 현재 슬롯 분석이 없으면 Gemini 를 1회 호출해 저장한다.
 * 응답을 보낸 뒤(after) 호출하도록 설계됐다 — 사용자 렌더를 막지 않는다.
 * 실패는 저장하지 않으므로 다음 방문/스케줄이 재시도한다.
 */
export async function generateIfMissing(
  slot: Slot = currentSlot(),
  prefetched?: DashboardData,
): Promise<void> {
  if (!(await needsGeneration(slot))) return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      console.log(`[ai] Gemini 호출 (슬롯 ${slot.key}) — 슬롯당 1번만 보여야 정상`);
      // 페이지가 이미 가져온 데이터를 재사용하면 after() 생성이 Gemini 호출 시간(~5초)으로
      // 줄어 Netlify 무료 티어(10초)에서도 안전하게 끝난다.
      const dashboard = prefetched ?? (await getDashboardData());
      // 섹터는 05:30 슬롯에서만, 하루 1회 조회한다 (실패해도 분석은 진행).
      const sectors = slot.isDawn ? await fetchSectorSnapshot() : null;
      const analysis = await analyzeWithGemini(dashboard, slot.isDawn, sectors);
      const record: Record_ = { analysis, slot, sectors };
      await storeSet(slotKeyOf(slot), record);
      await storeSet(LATEST_KEY, record);
    } catch (err) {
      console.error(`[ai] 슬롯 ${slot.key} 생성 실패 — 저장 안 함, 다음에 재시도:`, err);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
