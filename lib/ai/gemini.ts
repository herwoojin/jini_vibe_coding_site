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

export interface AiAnalysis {
  markets: AiMarketOpinion[];
  overall: string;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    markets: {
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
    },
    overall: { type: 'STRING' },
  },
  required: ['markets', 'overall'],
} as const;

function buildPrompt(d: DashboardData): string {
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
  ].join('\n');
}

/** Gemini 1회 호출. 실패 시 예외 — 호출부(슬롯 캐시)가 실패를 캐시하지 않도록 던진다. */
export async function analyzeWithGemini(d: DashboardData): Promise<AiAnalysis> {
  const key = process.env.GEMINI_KEY;
  if (!key) throw new Error('GEMINI_KEY is not set');

  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(d) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
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
