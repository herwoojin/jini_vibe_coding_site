// MacroSignal — 오늘의 주도주 섹터 스캔 (프롬프트 B)
//
// 개별 종목 분석과 같은 2단계 구조를 쓴다:
//   1단계 짧은 검색 전용 호출 → 실제로 Google 검색이 일어난다
//   2단계 검색 결과만 보고 JSON 구조화 → 없는 사실을 지어낼 수 없다
// 긴 프롬프트로 한 번에 시키면 모델이 검색을 건너뛰고 지어낸다(실측 확인).
import { generateGroundedContent, extractJsonFlexible } from './grounded';

const MODEL = 'gemini-2.5-flash';

export interface SectorLeader {
  name: string;
  ticker: string;
  change_pct: number | null;
  role: '대장주' | '2등주' | '소외주';
  note: string;
}

export interface LeadingSector {
  rank: number;
  sector_name: string;
  strength: 'strong' | 'moderate';
  change_pct: number | null;
  catalyst: string;
  sustainability: string;
  leaders: SectorLeader[];
}

export interface WatchItem {
  name: string;
  ticker: string;
  sector: string;
  action: 'buy' | 'sell' | 'watch';
  urgency: 'today' | 'this_week' | 'monitor';
  current_price: number | null;
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  upside_pct: number | null;
  confidence: number;
  reason: string;
  risk: string;
}

export interface SectorScan {
  as_of: string;
  market: 'KR';
  market_summary: {
    index_name: string;
    index_value: number | null;
    index_change_pct: number | null;
    sentiment: 'risk_on' | 'risk_off' | 'neutral';
    headline: string;
    foreign_net_buy: string;
  };
  leading_sectors: LeadingSector[];
  watch_list: WatchItem[];
  avoid_sectors: { sector_name: string; reason: string }[];
  /** 검색 근거 */
  sources: { title: string; uri: string }[];
  queries: string[];
  /** 검색 실패 — UI 에 경고를 띄우고 수치를 신뢰하지 않는다 */
  ungrounded: boolean;
  scannedAt: string;
}

const RESEARCH_SYSTEM = `당신은 한국 증시 리서치 어시스턴트입니다.
반드시 Google 검색을 수행해 오늘 장의 실제 데이터를 확인하십시오.
검색으로 확인되지 않은 수치는 "확인되지 않음"이라고만 쓰고 절대 추정치를 지어내지 마십시오.`;

const STRUCTURE_SYSTEM = `당신은 한국 증시의 섹터 로테이션 분석 전문가입니다.
주어진 리서치 요약에 있는 내용만으로 판단하십시오.
리서치에 없는 종목·수치·촉매를 새로 만들어내는 것은 절대 금지입니다.
확인되지 않은 수치는 반드시 null 로 두십시오.
응답은 마크다운 코드블록 없이 순수 JSON만 출력합니다.`;

/**
 * 조사 기준일을 직접 계산한다.
 *
 * ⚠️ "오늘 증시를 조사하라"고만 하면 개장 전(KST 09:00 이전)에는 모델이
 * "아직 개장 전입니다" 한 줄만 답하고 멈춘다(실측). 기준 날짜를 못박아 줘야 한다.
 */
export function targetTradingDay(now = new Date()): { date: string; isLive: boolean } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(now).map(x => [x.type, x.value]));
  const minutes = (Number(p.hour) % 24) * 60 + Number(p.minute);
  const isWeekend = p.weekday === 'Sat' || p.weekday === 'Sun';
  // 장 마감(15:30) 이후 평일이면 오늘 데이터가 확정돼 있다.
  const closedToday = !isWeekend && minutes >= 15 * 60 + 30;
  if (closedToday) return { date: `${p.year}-${p.month}-${p.day}`, isLive: false };
  // 장중이면 오늘 진행 중 데이터
  if (!isWeekend && minutes >= 9 * 60) return { date: `${p.year}-${p.month}-${p.day}`, isLive: true };

  // 개장 전이거나 주말 → 직전 평일로 되돌린다.
  const d = new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return { date: d.toISOString().slice(0, 10), isLive: false };
}

/** 1단계 — 짧게 유지해야 모델이 실제로 검색한다. */
function buildResearchPrompt(target: string, isLive: boolean): string {
  return `${isLive ? `오늘 ${target}(한국시간) 장중입니다.` : `직전 거래일인 ${target}(한국시간) 기준입니다.`}
Google 검색으로 **${target} 한국 증시**를 조사해 항목별로 정리하세요.

1. 지수: 코스피와 코스닥 각각의 종가(또는 현재가)와 등락률을 따로 구분해서
2. 주도섹터: 오늘 거래대금·등락률 상위 섹터 3개와 각각의 상승 이유(촉매)
3. 대표종목: 각 주도 섹터의 대표 종목 3개씩. **반드시 6자리 종목코드를 함께 검색해
   "종목명(005930) +2.5%" 형식으로 표기하세요.** 종목코드를 못 찾으면 그 종목은 빼세요.
4. 수급: 외국인·기관 순매수 상위 종목
5. 소외섹터: 오늘 자금이 빠져나간 약세 섹터
6. 현재가: 위 대표종목들의 현재 주가(원)

각 항목을 "1. 지수: ..." 형식으로 쓰고, 검색으로 확인 안 된 것은 "확인되지 않음"이라고만 쓰세요.

⚠️ 반드시 지킬 것: "지금은 개장 전이라 데이터가 없습니다" 같은 안내만 하고 끝내지 마십시오.
${target} 은 이미 지나간(또는 진행 중인) 거래일이므로 검색하면 데이터가 존재합니다.
1~6번 항목을 모두 채워서 답하십시오.`;
}

/** 2단계 — 검색 결과를 구조화만 한다. */
function buildStructurePrompt(research: string, target: string, grounded: boolean): string {
  return `${target}(한국시간) 한국 증시의 주도주 섹터를 아래 리서치 요약을 근거로 구조화하세요.

[리서치 요약 — 이 안에 있는 내용만 사용하십시오]
${grounded ? research : '⚠️ 검색에 실패했습니다. leading_sectors 와 watch_list 를 빈 배열로 두고 headline 에 "실시간 데이터 조회 실패"라고 쓰십시오.'}

[응답 형식 — 순수 JSON만]
{
  "as_of": "YYYY-MM-DD HH:mm KST",
  "market": "KR",
  "market_summary": {
    "index_name": "<KOSPI 등>",
    "index_value": <숫자 또는 null>,
    "index_change_pct": <숫자 또는 null>,
    "sentiment": "risk_on"|"risk_off"|"neutral",
    "headline": "<오늘 장을 한 문장으로>",
    "foreign_net_buy": "<외국인 순매수 요약 한줄 또는 '데이터 부족'>"
  },
  "leading_sectors": [
    {
      "rank": 1,
      "sector_name": "<섹터명>",
      "strength": "strong"|"moderate",
      "change_pct": <숫자 또는 null>,
      "catalyst": "<오늘 강세 이유 1~2문장. 근거 없으면 '촉매 불명확'>",
      "sustainability": "<내일 이후 지속 가능성 한줄>",
      "leaders": [
        { "name": "<종목명>", "ticker": "<6자리 종목코드>", "change_pct": <숫자 또는 null>,
          "role": "대장주"|"2등주"|"소외주", "note": "<한줄>" }
      ]
    }
  ],
  "watch_list": [
    { "name": "<종목명>", "ticker": "<6자리 종목코드>", "sector": "<섹터명>",
      "action": "buy"|"sell"|"watch", "urgency": "today"|"this_week"|"monitor",
      "current_price": <숫자 또는 null>, "entry_price": <숫자 또는 null>,
      "target_price": <숫자 또는 null>, "stop_loss": <숫자 또는 null>,
      "upside_pct": <숫자 또는 null>, "confidence": <0.0~1.0>,
      "reason": "<1~2문장>", "risk": "<핵심 리스크 한줄>" }
  ],
  "avoid_sectors": [ { "sector_name": "<섹터명>", "reason": "<한줄>" } ]
}

[가격 결정 원칙]
- action=buy : entry_price 는 현재가와 같거나 0~-3%, target_price 는 +10~25%,
               stop_loss 는 진입가 대비 -5~10%
- action=sell: entry_price 는 null, target_price 에 매도 권장가
- action=watch: 가격 필드 전부 null 가능
- upside_pct = (target_price - entry_price) / entry_price * 100 으로 계산
- 리서치에 현재가가 없으면 가격 필드는 전부 null 로 두고 action 은 watch 로 하십시오.

[판단 원칙 — 반드시 준수]
- watch_list 는 최대 8개. 확신 없는 종목을 억지로 채우지 말 것.
- confidence 0.65 초과인 것만 buy/sell. 나머지는 전부 watch.
- 리서치에서 확인 안 된 수치는 반드시 null. 절대 추정치를 지어내지 말 것.
- ticker 는 리서치 본문에 실제로 적힌 6자리 종목코드만 그대로 옮기십시오.
  기억이나 추측으로 코드를 만들어내면 전혀 다른 회사를 가리키게 됩니다.
  리서치에 코드가 없으면 반드시 빈 문자열로 두십시오.
- 대장주가 이미 급등 마감이면 추격매수 위험을 risk 에 반드시 기재.
- 한국어, 냉철한 분석가 톤. "폭등 임박" 같은 과장 금지.`;
}

/**
 * 모델이 숫자 자리에 객체를 넣는 경우가 있다 (코스피·코스닥을 같이 물으면
 * index_value 에 {"KOSPI":6257.45,"KOSDAQ":737.35} 를 넣어 UI 렌더가 깨진다).
 * 숫자가 아니면 첫 번째 숫자 값을 꺼내 쓰고, 그것도 없으면 null 로 만든다.
 */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object') {
    const first = Object.values(v as Record<string, unknown>).find(
      x => typeof x === 'number' && Number.isFinite(x),
    );
    return typeof first === 'number' ? first : null;
  }
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,%\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 리서치에 없는 값이 새어 나오지 않도록 정합성을 강제한다. */
function sanitize(scan: SectorScan): SectorScan {
  const watch_list = (scan.watch_list ?? []).slice(0, 8).map(w => {
    const item = {
      ...w,
      current_price: toNumber(w.current_price),
      entry_price: toNumber(w.entry_price),
      target_price: toNumber(w.target_price),
      stop_loss: toNumber(w.stop_loss),
      confidence: toNumber(w.confidence) ?? 0,
    };
    // 신뢰도 미달이면 매매 권고를 관망으로 낮춘다.
    if (item.confidence <= 0.65 && item.action !== 'watch') item.action = 'watch';
    // 가격 정합성: 목표가가 진입가보다 낮으면 신뢰할 수 없다.
    if (
      item.action === 'buy' &&
      (item.entry_price === null ||
        item.target_price === null ||
        item.target_price <= item.entry_price)
    ) {
      item.action = 'watch';
      item.entry_price = null;
      item.target_price = null;
      item.stop_loss = null;
      item.upside_pct = null;
    }
    // upside 는 우리가 다시 계산한다 (모델 산수를 믿지 않는다).
    if (item.entry_price && item.target_price) {
      item.upside_pct = ((item.target_price - item.entry_price) / item.entry_price) * 100;
    } else {
      item.upside_pct = null;
    }
    return item;
  });

  return {
    ...scan,
    market_summary: {
      ...scan.market_summary,
      index_value: toNumber(scan.market_summary?.index_value),
      index_change_pct: toNumber(scan.market_summary?.index_change_pct),
    },
    leading_sectors: (scan.leading_sectors ?? []).slice(0, 4).map(sec => ({
      ...sec,
      change_pct: toNumber(sec.change_pct),
      leaders: (sec.leaders ?? []).map(l => ({ ...l, change_pct: toNumber(l.change_pct) })),
    })),
    watch_list,
    avoid_sectors: scan.avoid_sectors ?? [],
  };
}

export async function scanLeadingSectors(signal?: AbortSignal): Promise<SectorScan> {
  const { date: target, isLive } = targetTradingDay();

  // 1단계: 검색 전용
  const research = await generateGroundedContent(
    MODEL,
    RESEARCH_SYSTEM,
    buildResearchPrompt(target, isLive),
    signal,
  );
  // 검색은 됐어도 "개장 전입니다" 한 줄만 오는 경우가 있다. 그런 응답으로
  // 구조화를 돌리면 빈 섹터 목록이 나오므로, 분량으로 실질 여부를 판단한다.
  const grounded = !research.ungrounded && research.text.trim().length >= 200;

  // 2단계: 구조화 전용
  const structured = await generateGroundedContent(
    MODEL,
    STRUCTURE_SYSTEM,
    buildStructurePrompt(research.text, target, grounded),
    signal,
  );
  const parsed = extractJsonFlexible<SectorScan>(structured.text);
  if (!parsed || !parsed.market_summary) {
    throw new Error('Gemini 응답에서 JSON을 추출하지 못했습니다.');
  }

  return sanitize({
    ...parsed,
    market: 'KR',
    sources: research.sources,
    queries: research.queries,
    ungrounded: !grounded,
    scannedAt: new Date().toISOString(),
  });
}
