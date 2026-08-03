import { storeGet, storeSet } from '../ai/store';
import { fetchDividendUniverse, type DividendUniverse } from './dividends';
import { NOTICES, type DataNotice } from '../ai/notices';

/**
 * 배당 유니버스는 하루 1회만 갱신한다 (요청 사양).
 *
 * 조회에 10초 안팎이 걸리므로(Yahoo 429 회피용 순차 호출) 페이지 렌더에서 직접
 * 기다리면 Netlify 함수 타임아웃에 걸린다. AI 분석과 같은 구조로,
 * 페이지는 저장소만 읽고 생성은 응답 이후(after)에 돌린다.
 */

const key = (day: string) => `dividends:${day}`;
const LATEST = 'dividends:latest';

export interface CachedDividends extends DividendUniverse {
  /** 이 데이터를 만든 KST 날짜 */
  generatedFor: string;
  /** true = 오늘자 데이터가 아직 없어 직전 것을 보여주는 중 */
  stale: boolean;
  /** 데이터 신뢰도 알림 */
  notices: DataNotice[];
}

/** 종가 기준일이 며칠 전인지 (주말·휴장 감안해 4일 넘으면 알린다) */
function buildNotices(u: DividendUniverse, stale: boolean, generatedFor: string): DataNotice[] {
  const out: DataNotice[] = [];
  if (stale) out.push(NOTICES.stale(`${generatedFor} 갱신분`));

  if (u.asOf) {
    // ⚠️ 밀리초 차이로 계산하면 KST 날짜와 UTC 날짜가 어긋나는 새벽 시간대에
    // 하루 적게 나온다(KST 8/4 05시 = UTC 8/3 20시). 달력 날짜로 센다.
    const days = Math.round(
      (Date.parse(`${kstToday()}T00:00:00Z`) - Date.parse(`${u.asOf}T00:00:00Z`)) / 86_400_000,
    );
    // 주말·공휴일을 감안해 3일을 넘어가면 알린다.
    if (days >= 3) out.push(NOTICES.dataOlderThanExpected(u.asOf, days));
  }
  if (u.failed > 0) {
    out.push({
      level: 'info',
      title: `${u.failed}개 종목을 목록에서 제외했습니다`,
      detail: '시세·배당 이력을 받지 못한 종목입니다. 추정값으로 채우지 않고 아예 빼는 쪽을 택했습니다.',
    });
  }
  return out;
}

/** KST 기준 오늘 날짜 (서버가 UTC 여도 한국 날짜로 끊는다) */
export function kstToday(now: Date = new Date()): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(now);
}

type Record_ = DividendUniverse & { generatedFor: string };

/** 저장소만 읽는다 (네트워크 없음 → 항상 빠르다). */
export async function readDividends(day = kstToday()): Promise<CachedDividends | null> {
  const today = await storeGet<Record_>(key(day));
  if (today) return { ...today, stale: false, notices: buildNotices(today, false, today.generatedFor) };

  const latest = await storeGet<Record_>(LATEST);
  if (latest) {
    const stale = latest.generatedFor !== day;
    return { ...latest, stale, notices: buildNotices(latest, stale, latest.generatedFor) };
  }
  return null;
}

export async function needsDividendRefresh(day = kstToday()): Promise<boolean> {
  return (await storeGet<Record_>(key(day))) === null;
}

let inflight: Promise<void> | null = null;

/** 오늘자 데이터가 없으면 조회해 저장한다. 응답 이후(after)에 호출한다. */
export async function refreshDividendsIfMissing(day = kstToday()): Promise<void> {
  if (!(await needsDividendRefresh(day))) return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      console.log(`[dividends] 유니버스 조회 (${day}) — 하루 1번만 보여야 정상`);
      const universe = await fetchDividendUniverse();
      if (!universe) return; // 실패는 저장하지 않는다 → 다음 방문이 재시도
      const record: Record_ = { ...universe, generatedFor: day };
      await storeSet(key(day), record);
      await storeSet(LATEST, record);
    } catch (err) {
      console.error('[dividends] 갱신 실패:', err);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
