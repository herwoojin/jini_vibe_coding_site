/**
 * Gemini 시장 분석 클라이언트.
 * - 인증: x-goog-api-key 헤더 (URL 에 키를 남기지 않는다)
 * - responseSchema 로 JSON 강제 → 파싱 실패 원천 차단
 * - 호출 빈도 제어는 여기가 아니라 lib/ai/analysis.ts 의 슬롯 캐시가 담당한다
 */
import type { DashboardData } from '../data/dashboard';

const MODEL = 'gemini-2.5-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface AiMarketOpinion {
  market_code: string;
  market_name: string;
  opinion: '매수' | '중립' | '매도';
  confidence: '높음' | '중간' | '낮음';
  reasons: string[];
}

/** 05:30 슬롯 전용 — 미 증시 마감 직후의 주도 흐름 판단 */
export interface AiUsMarket {
  /** 나스닥 종합 방향: 상승/하락/보합 */
  nasdaq_direction: '상승' | '하락' | '보합';
  /** 주도 스타일: 성장주 우위 / 가치주 우위 / 혼조 */
  leadership: '성장주 우위' | '가치주 우위' | '혼조';
  /** 위험선호: 개선 / 악화 / 중립 (VIX 기준) */
  risk_appetite: '개선' | '악화' | '중립';
  /** 위 판단의 수치 근거 3~5개 */
  notes: string[];
}

export interface AiAnalysis {
  markets: AiMarketOpinion[];
  overall: string;
  /** 05:30 슬롯에서만 채워진다 */
  us_market?: AiUsMarket;
}

const MARKETS_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      market_code: { type: 'STRING' },
      market_name: { type: 'STRING' },
      opinion: { type: 'STRING', enum: ['매수', '중립', '매도'] },
      confidence: { type: 'STRING', enum: ['높음', '중간', '낮음'] },
      reasons: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['market_code', 'market_name', 'opinion', 'confidence', 'reasons'],
  },
};

const US_MARKET_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nasdaq_direction: { type: 'STRING', enum: ['상승', '하락', '보합'] },
    leadership: { type: 'STRING', enum: ['성장주 우위', '가치주 우위', '혼조'] },
    risk_appetite: { type: 'STRING', enum: ['개선', '악화', '중립'] },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['nasdaq_direction', 'leadership', 'risk_appetite', 'notes'],
};

/** 새벽 슬롯에서만 us_market 을 요구한다. */
function responseSchema(isDawn: boolean) {
  return isDawn
    ? {
        type: 'OBJECT',
        properties: { markets: MARKETS_SCHEMA, overall: { type: 'STRING' }, us_market: US_MARKET_SCHEMA },
        required: ['markets', 'overall', 'us_market'],
      }
    : {
        type: 'OBJECT',
        properties: { markets: MARKETS_SCHEMA, overall: { type: 'STRING' } },
        required: ['markets', 'overall'],
      };
}

/** 새벽 슬롯 전용 지시문 — 미 증시 마감 직후의 주도 흐름을 판단시킨다. */
const DAWN_INSTRUCTIONS = [
  '',
  '## 추가 과제 (us_market) — 미국 증시 마감 직후 분석',
  '아래 미국 지수 데이터로 다음 3가지를 판단하고 notes 에 수치 근거를 3~5개 써라.',
  '1) nasdaq_direction: 나스닥 종합(NASDAQCOM)이 전일 대비 상승했는지 하락했는지 (±0.1% 미만이면 보합).',
  '2) leadership: 나스닥100(NDX, 성장주 대표)과 다우 산업(DJIA, 가치·경기민감 대표)의 전일 대비',
  '   변화율을 비교하라. NDX 가 더 오르면 "성장주 우위", DJIA 가 더 오르면 "가치주 우위",',
  '   차이가 0.2%p 미만이면 "혼조". 반드시 두 지수의 변화율을 모두 인용하라.',
  '3) risk_appetite: VIX 가 하락하면 위험선호 "개선", 상승하면 "악화", ±3% 이내면 "중립".',
  '주의: 이 데이터에는 야간 선물지수와 개별 업종(섹터) ETF 가 없다. 선물이나 특정 섹터',
  '(반도체·금융·에너지 등)의 등락을 지어내지 마라. 지수 간 상대 강도로만 주도 스타일을 말하라.',
].join('\n');

function buildPrompt(d: DashboardData, isDawn: boolean): string {
  const indicators = d.macroCards.map(c => ({
    지표: c.indicator.name,
    값: c.current,
    단위: c.indicator.unit,
    전일대비: c.changeAbs,
    변화율pct: Number(c.changePct.toFixed(2)),
    기준일: c.asOf,
  }));
  const signals = d.signals.map(s => ({
    시장: s.market_name,
    코드: s.market_code,
    규칙엔진_스코어: s.score,
    규칙엔진_등급: s.level,
    기여도: s.contributors.map(c => ({
      지표: c.indicator_name,
      z점수: c.z_score,
      기여: c.contrib,
    })),
  }));

  return [
    '너는 거시경제 데이터 기반의 시장 분석가다. 아래 실측 데이터만 근거로 판단하라.',
    '코스피·코스닥·나스닥 각각에 대해 오늘의 의견(매수/중립/매도)과 확신도를 내고,',
    '이유(reasons)는 시장당 3~5개, 반드시 아래 데이터의 구체적 수치(환율·유가·금리·지수 값과 변화율)를 인용해서 써라.',
    '데이터에 없는 사실을 지어내지 마라. overall 은 3~4문장의 한국어 종합 코멘트로,',
    '마지막 문장은 반드시 "본 분석은 투자 참고 정보이며 투자 권유가 아닙니다." 로 끝내라.',
    '',
    `## 거시지표 (${d.signalsAsOf} 기준)`,
    JSON.stringify(indicators, null, 1),
    '',
    '## 규칙엔진 신호 (z-score 기반, 참고용 — 동의하지 않으면 다른 의견을 내도 된다)',
    JSON.stringify(signals, null, 1),
    isDawn ? DAWN_INSTRUCTIONS : '',
  ].join('\n');
}

/** Gemini 1회 호출. 실패 시 예외 — 호출부(슬롯 캐시)가 실패를 캐시하지 않도록 던진다. */
export async function analyzeWithGemini(d: DashboardData, isDawn = false): Promise<AiAnalysis> {
  const key = process.env.GEMINI_KEY;
  if (!key) throw new Error('GEMINI_KEY is not set');

  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(d, isDawn) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: responseSchema(isDawn),
      },
    }),
    // POST 는 Next 가 캐시하지 않지만, 의도를 명시한다 — 캐시는 슬롯 계층의 책임이다.
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini: empty response (${JSON.stringify(json).slice(0, 150)})`);

  const parsed = JSON.parse(text) as AiAnalysis;
  if (!Array.isArray(parsed.markets) || parsed.markets.length === 0 || !parsed.overall) {
    throw new Error('Gemini: schema violation');
  }
  return parsed;
}
