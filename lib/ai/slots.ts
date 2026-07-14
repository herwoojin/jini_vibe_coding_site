/**
 * AI 분석 슬롯 — 하루 3번(KST 07:50 / 12:00 / 15:10)만 Gemini 를 호출하기 위한 키.
 *
 * 같은 슬롯 안에서는 방문자가 몇 명이든 같은 키가 나오고, unstable_cache 가
 * 이 키를 캐시 키로 써서 슬롯당 정확히 1회만 API 가 호출된다.
 * 서버가 UTC(Netlify)여도 KST 로 계산한다.
 */

/** 슬롯 경계 (KST, 분 단위): 05:30, 12:00, 15:10 */
const SLOT_BOUNDARIES = [
  { minutes: 5 * 60 + 30, label: '05:30' },
  { minutes: 12 * 60, label: '12:00' },
  { minutes: 15 * 60 + 10, label: '15:10' },
];

/** 새벽 슬롯 — 미국 증시 마감 직후라 미 증시 주도 흐름을 함께 분석한다. */
export const DAWN_SLOT_LABEL = '05:30';

export interface Slot {
  /** 캐시 키. 예: "2026-07-10#12:00" */
  key: string;
  /** 화면 표기. 예: "2026-07-10 12:00 기준" */
  label: string;
  /** 05:30 슬롯 여부 — 미 증시 마감 직후이므로 미국장 주도 흐름을 함께 분석한다. */
  isDawn: boolean;
}

/** KST 기준 (날짜문자열, 자정 이후 경과 분) */
function kstParts(now: Date): { date: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map(x => [x.type, x.value]));
  // hour12:false 에서 자정이 "24" 로 나오는 런타임이 있다.
  const hour = Number(p.hour) % 24;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: hour * 60 + Number(p.minute),
  };
}

/** KST 날짜 문자열에서 하루 전 날짜 */
function prevDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`); // 정오 기준이라 DST/경계 문제 없음
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** 현재 시각이 속한 슬롯. 07:50 이전이면 전날 15:10 슬롯이다. */
export function currentSlot(now: Date = new Date()): Slot {
  const { date, minutes } = kstParts(now);

  let boundary: { label: string } | null = null;
  for (const b of SLOT_BOUNDARIES) {
    if (minutes >= b.minutes) boundary = b;
  }

  if (!boundary) {
    const d = prevDate(date);
    const last = SLOT_BOUNDARIES[SLOT_BOUNDARIES.length - 1];
    return {
      key: `${d}#${last.label}`,
      label: `${d} ${last.label} 기준`,
      isDawn: last.label === DAWN_SLOT_LABEL,
    };
  }
  return {
    key: `${date}#${boundary.label}`,
    label: `${date} ${boundary.label} 기준`,
    isDawn: boundary.label === DAWN_SLOT_LABEL,
  };
}
