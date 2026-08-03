import { scanLeadingSectors, type SectorScan } from '@/lib/ai/sector-scan';
import { storeGet, storeSet } from '@/lib/ai/store';
import { NOTICES } from '@/lib/ai/notices';

/**
 * 오늘의 주도주 섹터 스캔.
 * 그라운딩 검색 2회라 60초 안팎 걸리고 비용도 크므로, 캐시로 호출을 강하게 억제한다.
 * (장중 5분 / 장외 30분 — 요청 사양)
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
function cacheKey(now = new Date()): string {
  const { date, minutes } = kstParts(now);
  const inSession = minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
  const bucket = inSession ? 5 : 30;
  const slot = Math.floor(minutes / bucket) * bucket;
  return `sector:${date}#${String(slot).padStart(4, '0')}`;
}

const LATEST = 'sector:latest';

export async function GET() {
  try {
    if (!process.env.GEMINI_KEY) {
      return Response.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 503 });
    }

    const key = cacheKey();
    const cached = await storeGet<SectorScan>(key);
    if (cached) {
      // 캐시된 결과임을 알린다 (지금 시장과 다를 수 있다).
      const inSession = (() => {
        const { minutes } = kstParts();
        return minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
      })();
      return Response.json({
        scan: { ...cached, notices: [...(cached.notices ?? []), NOTICES.cached(inSession ? 5 : 30)] },
        cached: true,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110_000);

    try {
      const scan = await scanLeadingSectors(controller.signal);
      // 검색 실패(ungrounded) 결과는 캐시하지 않는다 — 빈 화면을 5~30분 고정시키게 된다.
      if (!scan.ungrounded) {
        await storeSet(key, scan);
        await storeSet(LATEST, scan);
      }
      return Response.json({ scan, cached: false });
    } catch (err) {
      // 실패 시 직전 성공본이라도 보여준다 (빈 화면보다 낫다).
      const latest = await storeGet<SectorScan>(LATEST);
      if (latest) return Response.json({ scan: latest, cached: true, stale: true });
      throw err;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    console.error('[sector-scan]', err);
    return Response.json(
      {
        error: isAbort
          ? '스캔 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
          : err instanceof Error
            ? err.message
            : '스캔에 실패했습니다.',
        notices: [
          isAbort
            ? NOTICES.timeout()
            : NOTICES.analysisFailed(err instanceof Error ? err.message : '알 수 없는 오류'),
        ],
      },
      { status: isAbort ? 504 : 500 },
    );
  }
}
