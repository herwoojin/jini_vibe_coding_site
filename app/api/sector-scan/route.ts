import { after } from 'next/server';
import { scanLeadingSectors, type SectorScan } from '@/lib/ai/sector-scan';
import { storeGet, storeSet } from '@/lib/ai/store';
import { NOTICES } from '@/lib/ai/notices';

/**
 * 오늘의 주도주 섹터 스캔.
 *
 * ⚠️ 스캔은 그라운딩 검색 2회로 50초 안팎 걸린다(실측). 요청 안에서 끝내려 하면
 * 배포 환경의 함수 실행 제한(Netlify 무료 티어 10초)에 걸려 항상 실패한다.
 * 그래서 응답 이후(after)에 백그라운드로 돌리고 클라이언트가 폴링해 받아간다.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** KST 기준 (날짜, 분) */
function kstParts(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(now).map(x => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + Number(p.minute) };
}

/** 장중(09:00~15:30 KST)이면 5분, 아니면 30분 단위로 캐시 키를 끊는다. */
function cacheKey(now = new Date()): { key: string; bucket: number } {
  const { date, minutes } = kstParts(now);
  const inSession = minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
  const bucket = inSession ? 5 : 30;
  const slot = Math.floor(minutes / bucket) * bucket;
  return { key: `sector:${date}#${String(slot).padStart(4, '0')}`, bucket };
}

const LATEST = 'sector:latest';

/** 같은 슬롯에서 중복 생성을 막는다 (여러 명이 동시에 눌러도 1회만 돈다). */
const inflight = new Map<string, Promise<void>>();

function startScan(key: string): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = (async () => {
    try {
      console.log(`[sector-scan] 백그라운드 스캔 시작 (${key})`);
      const scan = await scanLeadingSectors();
      // 검색 실패(ungrounded) 결과는 캐시하지 않는다 — 빈 화면을 5~30분 고정시키게 된다.
      if (!scan.ungrounded) {
        await storeSet(key, scan);
        await storeSet(LATEST, scan);
      }
      console.log(`[sector-scan] 완료 — 섹터 ${scan.leading_sectors.length}개`);
    } catch (err) {
      console.error('[sector-scan] 백그라운드 스캔 실패:', err);
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
}

export async function GET() {
  try {
    if (!process.env.GEMINI_KEY) {
      return Response.json(
        { error: 'Gemini API 키가 설정되지 않았습니다.', notices: [NOTICES.analysisFailed('GEMINI_KEY 미설정')] },
        { status: 503 },
      );
    }

    const { key, bucket } = cacheKey();
    const cached = await storeGet<SectorScan>(key);
    if (cached) {
      return Response.json({
        scan: { ...cached, notices: [...(cached.notices ?? []), NOTICES.cached(bucket)] },
        cached: true,
      });
    }

    // 아직 없으면 백그라운드로 시작하고 즉시 응답한다 (함수 타임아웃 회피).
    const job = startScan(key);
    after(() => job);

    // 기다리는 동안 직전 결과라도 보여준다.
    const latest = await storeGet<SectorScan>(LATEST);
    return Response.json({
      pending: true,
      scan: latest
        ? { ...latest, notices: [...(latest.notices ?? []), NOTICES.stale('직전 스캔')] }
        : null,
      cached: false,
    });
  } catch (err) {
    console.error('[sector-scan]', err);
    const message = err instanceof Error ? err.message : '스캔에 실패했습니다.';
    return Response.json(
      { error: message, notices: [NOTICES.analysisFailed(message)] },
      { status: 500 },
    );
  }
}
