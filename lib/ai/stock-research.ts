// MacroSignal — 개별 종목 매수/매도 타이밍 분석
//
// 설계 원칙: 시세는 AI 가 아니라 Yahoo 실측을 권위값으로 쓴다.
// 그라운딩된 Gemini 도 시세를 잘 맞히지만(실측 대조 확인), 숫자를 문장에서
// 옮겨 적는 과정은 언제든 틀릴 수 있다. 돈이 걸린 값이므로 구조화된 API 를 쓰고,
// AI 에게는 검색이 아니면 알 수 없는 것(뉴스·공시·주도 섹터·수급)을 맡긴다.
import { generateGroundedContent, extractJsonFlexible } from './grounded';
import { fetchYahoo } from '../data/yahoo';
import { atr14 } from '../engine/dividend';

const MODEL = 'gemini-2.5-flash';

export interface StockSignal {
  signal: 'buy' | 'sell' | 'hold';
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  exit_price: number | null;
  reasoning: string;
  confidence: number;
  checklist: {
    volume_profile: string;
    moving_avg: string;
    news: string;
    disclosure: string;
    momentum: string;
    leading_sector: string;
    closing_bet: string;
  };
  leading_sector_today: boolean;
  leading_sector_name: string;
  closing_bet: {
    recommended: boolean;
    entry_window: string;
    reasoning: string;
  };
}

export interface StockQuote {
  name: string;
  symbol: string;
  price: number;
  currency: string;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  week52High: number;
  week52Low: number;
  asOf: string;
  /** 이동평균 — 실측 시계열에서 직접 계산 (AI 추정 아님) */
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  atr: number;
}

export interface StockAnalysis {
  quote: StockQuote;
  signal: StockSignal;
  /** 1단계 검색으로 확보한 리서치 원문 (검증 가능하도록 보관) */
  research: string;
  sources: { title: string; uri: string }[];
  queries: string[];
  /** 검색 근거 없이 생성됐는가 — true 면 UI 에 경고를 띄운다 */
  ungrounded: boolean;
  analyzedAt: string;
}

/**
 * 1단계: 검색 전용 (짧게).
 *
 * ⚠️ 실측으로 확인한 사실: 시세·이평선 등 데이터를 잔뜩 준 긴 프롬프트로 JSON 을 요구하면
 * 모델이 "이미 정보가 충분하다"고 판단해 검색을 건너뛴다(출처 0개). 그 상태에서도
 * "상반기 실적 발표", "분기 배당 결정" 같은 구체적 뉴스를 지어내므로 매우 위험하다.
 * 그래서 검색은 짧고 검색만 시키는 호출로 분리한다.
 */
const RESEARCH_SYSTEM = `당신은 주식 리서치 어시스턴트입니다.
반드시 Google 검색을 수행해 확인된 사실만 보고하십시오.
검색으로 찾지 못한 항목은 반드시 "확인되지 않음"이라고 쓰십시오. 추측이나 일반론으로 채우지 마십시오.`;

/** 2단계: 판단 전용 (검색 결과 + 실측 수치만 보고 JSON 생성) */
const JUDGE_SYSTEM = `당신은 한국 및 미국 주식의 전문 트레이딩 분석가입니다.
주어진 리서치 요약과 실측 수치만을 근거로 판단하십시오.
리서치 요약에 없는 뉴스·공시·수급을 새로 지어내는 것은 절대 금지입니다.
시세와 이동평균선은 주어진 실측값을 그대로 사용하십시오.
응답은 마크다운 코드블록 없이 순수 JSON만 출력합니다.`;

/** 1단계 프롬프트 — 짧게 유지해야 모델이 실제로 검색한다. */
function buildResearchPrompt(name: string, symbol: string, today: string): string {
  return `오늘은 ${today}입니다. Google 검색으로 다음을 조사해 항목별로 한국어 한두 문장씩 정리하세요.

종목: ${name} (${symbol})

1. 뉴스: 최근 1~2주 이 종목 관련 주요 뉴스
2. 공시: 최근 공시 (실적·배당·자사주·유상증자·M&A)
3. 수급: 외국인·기관 순매수 동향
4. 주도섹터: 오늘 한국 증시에서 거래대금·등락률 상위 섹터는 무엇이며, 이 종목이 거기 속하는가
5. 모멘텀: RSI·MACD 등 확인 가능한 기술적 지표

각 항목은 "1. 뉴스: ..." 형식으로 쓰고, 검색으로 확인 안 된 항목은 "확인되지 않음"이라고만 쓰세요.`;
}

function ma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  const w = closes.slice(-n);
  return w.reduce((s, v) => s + v, 0) / n;
}

function buildJudgePrompt(q: StockQuote, research: string, grounded: boolean): string {
  const unit = q.currency === 'KRW' ? '원' : '달러';
  const trend = [
    q.ma5 !== null && `5일 ${Math.round(q.ma5).toLocaleString()}`,
    q.ma20 !== null && `20일 ${Math.round(q.ma20).toLocaleString()}`,
    q.ma60 !== null && `60일 ${Math.round(q.ma60).toLocaleString()}`,
  ]
    .filter(Boolean)
    .join(' / ');

  return `다음 종목의 매수·매도 타이밍을 분석하세요.

종목명: ${q.name}
티커: ${q.symbol}
[아래 수치는 실측 확정값입니다. 그대로 사용하고 변경하지 마십시오]
현재가(최근 종가): ${q.price.toLocaleString()}${unit}
전일대비: ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%
당일 고가/저가: ${q.dayHigh.toLocaleString()} / ${q.dayLow.toLocaleString()}
52주 고가/저가: ${q.week52High.toLocaleString()} / ${q.week52Low.toLocaleString()}
이동평균선: ${trend || '데이터 부족'}
ATR(14일 평균 변동폭): ${Math.round(q.atr).toLocaleString()}${unit}
기준일: ${q.asOf}

[검색으로 조사된 리서치 요약 — 이 내용 밖의 사실을 새로 만들지 마십시오]
${grounded ? research : '⚠️ 검색에 실패했습니다. 뉴스·공시·수급·주도섹터는 모두 "확인되지 않음"으로 처리하고, 신호는 hold, confidence 는 0.3 이하로 하십시오.'}

[판단할 것]
위 리서치와 실측 수치(이평선·ATR·52주 범위)를 근거로 매수/매도/관망을 판단하고,
종가베팅(14:30~15:30 KST 매수 후 익일 시초가 매도) 적합성도 함께 평가하십시오.

[응답 형식 — 순수 JSON만]
{
  "signal": "buy"|"sell"|"hold",
  "entry_price": <숫자 또는 null>,
  "target_price": <숫자 또는 null>,
  "stop_loss": <숫자 또는 null>,
  "exit_price": <숫자 또는 null>,
  "reasoning": "<2~3문장. 뉴스·공시·이평선·수급 통합 근거. 추측 금지>",
  "confidence": <0.0~1.0>,
  "checklist": {
    "volume_profile": "<지지/저항 가격대 한줄>",
    "moving_avg": "<위 이평선 수치 기준 정배열/역배열 한줄>",
    "news": "<최근 뉴스 한줄, 없으면 '특이 뉴스 확인되지 않음'>",
    "disclosure": "<공시 한줄, 없으면 '특이 공시 확인되지 않음'>",
    "momentum": "<RSI/MACD 한줄, 모르면 '데이터 부족'>",
    "leading_sector": "<주도 섹터 여부 + 이유 한줄>",
    "closing_bet": "<종가베팅 적합성 한줄>"
  },
  "leading_sector_today": <true|false>,
  "leading_sector_name": "<섹터명 또는 빈 문자열>",
  "closing_bet": { "recommended": <true|false>, "entry_window": "<한줄>", "reasoning": "<1~2문장>" }
}

[가격 결정 원칙 — 반드시 준수]
- buy: entry_price 는 현재가와 같거나 0~-3% (지금 사기 좋은 가격. 크게 낮추면 그건 손절가다).
       target_price 는 현재가보다 명확히 높게(+10~25%), 52주 고가·저항선 근거.
       stop_loss 는 entry_price 대비 -5~10%, 직전 저점 참고. ATR 을 활용해 현실적으로 잡을 것.
- sell: exit_price 는 현재가 이상 또는 비슷하게. entry_price 는 null.
- hold: 모든 가격 필드 null 허용.
- entry_price 와 target_price 에 같은 값을 넣지 말 것.

[판단 원칙]
- confidence 0.65 초과일 때만 buy/sell. 그 외는 전부 hold.
- 검색으로 확인 안 된 내용은 "확인되지 않음"으로 쓰고 지어내지 말 것.
- 한국어, 냉철한 분석가 톤. "폭등 임박" 같은 과장 금지.`;
}

/** 가격 필드가 상식에 맞는지 검사한다. 어긋나면 신호를 hold 로 낮춘다. */
function sanitize(signal: StockSignal, price: number): { signal: StockSignal; warning?: string } {
  const s = { ...signal };

  if (s.signal === 'buy') {
    const bad =
      s.entry_price === null ||
      s.target_price === null ||
      s.target_price <= s.entry_price ||
      (s.stop_loss !== null && s.stop_loss >= s.entry_price) ||
      Math.abs(s.entry_price - price) / price > 0.15; // 현재가와 15% 넘게 벌어지면 비정상
    if (bad) {
      return {
        signal: { ...s, signal: 'hold', entry_price: null, target_price: null, stop_loss: null },
        warning: 'AI 가 제시한 가격이 서로 모순되어 관망으로 조정했습니다.',
      };
    }
  }
  if (s.confidence <= 0.65 && s.signal !== 'hold') {
    return {
      signal: { ...s, signal: 'hold' },
      warning: '신뢰도가 0.65 이하라 관망으로 조정했습니다.',
    };
  }
  return { signal: s };
}

export async function analyzeStock(
  symbol: string,
  name: string,
  signal?: AbortSignal,
): Promise<{ analysis: StockAnalysis; warning?: string }> {
  // 1) 시세는 실측으로 확정한다 (AI 에게 맡기지 않는다)
  const y = await fetchYahoo(symbol, '1y');
  if (!y) throw new Error(`${name} 시세를 가져오지 못했습니다.`);

  const closes = y.bars.map(b => b.close);
  const last = y.bars[y.bars.length - 1];
  const prev = y.bars[y.bars.length - 2];
  const year = y.bars.slice(-252);

  const quote: StockQuote = {
    name,
    symbol,
    price: last.close,
    currency: y.currency,
    changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : 0,
    dayHigh: last.high,
    dayLow: last.low,
    week52High: Math.max(...year.map(b => b.high)),
    week52Low: Math.min(...year.map(b => b.low)),
    asOf: last.ts,
    ma5: ma(closes, 5),
    ma20: ma(closes, 20),
    ma60: ma(closes, 60),
    atr: atr14(y.bars),
  };

  // 2) 검색 전용 호출 (짧게 → 실제로 검색이 일어난다)
  const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  const research = await generateGroundedContent(
    MODEL,
    RESEARCH_SYSTEM,
    buildResearchPrompt(name, symbol, today),
    signal,
  );
  const grounded = !research.ungrounded;

  // 3) 판단 전용 호출 (검색 결과 + 실측 수치만 보고 JSON)
  const judged = await generateGroundedContent(
    MODEL,
    JUDGE_SYSTEM,
    buildJudgePrompt(quote, research.text, grounded),
    signal,
  );
  const parsed = extractJsonFlexible<StockSignal>(judged.text);
  if (!parsed || !parsed.signal) {
    throw new Error('Gemini 응답에서 JSON을 추출하지 못했습니다.');
  }

  const { signal: safe, warning } = sanitize(parsed, quote.price);

  // 검색이 실패했다면 뉴스·공시류 항목은 신뢰할 수 없으므로 강제로 덮어쓴다.
  if (!grounded) {
    safe.checklist = {
      ...safe.checklist,
      news: '검색 실패 — 확인되지 않음',
      disclosure: '검색 실패 — 확인되지 않음',
      leading_sector: '검색 실패 — 확인되지 않음',
    };
    safe.leading_sector_today = false;
    safe.leading_sector_name = '';
  }

  return {
    analysis: {
      quote,
      signal: safe,
      research: grounded ? research.text : '',
      sources: research.sources,
      queries: research.queries,
      ungrounded: !grounded,
      analyzedAt: new Date().toISOString(),
    },
    warning:
      warning ??
      (!grounded ? '검색 근거를 확보하지 못해 뉴스·공시 항목을 비웠습니다.' : undefined),
  };
}
