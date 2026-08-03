// MacroSignal — Google 검색 그라운딩 Gemini 호출
//
// ⚠️ 그라운딩 없이 시세를 물으면 모델이 학습 시점의 옛 주가를 자신 있게 지어낸다.
// 반드시 tools 를 붙여야 하며, 모델 세대마다 포맷이 달라 3단계로 폴백한다.
//   1차 google_search           (Gemini 2.x)
//   2차 google_search_retrieval (Gemini 1.5)
//   3차 tools 없음              (최후 — 이 경우 시세를 신뢰하지 않는다)

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export interface GroundedResult {
  text: string;
  /** 그라운딩에 실제로 사용된 출처 URL/제목 */
  sources: { title: string; uri: string }[];
  /** 모델이 실행한 검색어 — 무엇을 근거로 삼았는지 추적용 */
  queries: string[];
  /** 3차 폴백으로 떨어졌는가 = 검색 근거 없음 → 시세를 신뢰하면 안 된다 */
  ungrounded: boolean;
}

type ToolSpec = Record<string, unknown>[] | undefined;

const TOOL_VARIANTS: { label: string; tools: ToolSpec }[] = [
  { label: 'google_search', tools: [{ google_search: {} }] },
  {
    label: 'google_search_retrieval',
    tools: [
      {
        google_search_retrieval: {
          dynamic_retrieval_config: { mode: 'MODE_DYNAMIC', dynamic_threshold: 0.3 },
        },
      },
    ],
  },
  { label: 'no-tools', tools: undefined },
];

export async function generateGroundedContent(
  model: string,
  systemInstruction: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<GroundedResult> {
  const key = process.env.GEMINI_KEY;
  if (!key) throw new Error('GEMINI_KEY is not set');

  let lastError = '';

  for (const variant of TOOL_VARIANTS) {
    try {
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { temperature: 0.2 },
      };
      if (variant.tools) body.tools = variant.tools;

      const res = await fetch(ENDPOINT(model), {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal,
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`;
        // 조용히 폴백하면 "왜 검색이 안 됐는지" 알 수 없다. 반드시 남긴다.
        console.warn(`[grounded] ${variant.label} 실패 → 다음 단계로: ${lastError}`);
        continue;
      }

      const json = await res.json();
      const candidate = json?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = `empty response (${JSON.stringify(json).slice(0, 140)})`;
        continue;
      }

      const gm = candidate.groundingMetadata ?? {};
      const sources = (gm.groundingChunks ?? [])
        .map((c: { web?: { title?: string; uri?: string } }) => ({
          title: c.web?.title ?? '',
          uri: c.web?.uri ?? '',
        }))
        .filter((s: { uri: string }) => s.uri);

      return {
        text,
        sources,
        queries: gm.webSearchQueries ?? [],
        ungrounded: !variant.tools || sources.length === 0,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Gemini 그라운딩 호출 실패: ${lastError}`);
}

/**
 * LLM 응답에서 JSON 추출. "JSON만 출력하라"고 해도 코드펜스를 씌우는 경우가 잦다.
 * 실패해도 throw 하지 않고 null 을 돌려준다 (호출부가 상황에 맞게 처리).
 */
export function extractJsonFlexible<T = unknown>(text: string): T | null {
  // 1) ```json ... ``` 코드펜스
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim()) as T;
    } catch {
      /* 다음 단계 */
    }
  }
  // 2) 전체 파싱
  try {
    return JSON.parse(text.trim()) as T;
  } catch {
    /* 다음 단계 */
  }
  // 3) 첫 { ~ 마지막 }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      /* 실패 */
    }
  }
  return null;
}
