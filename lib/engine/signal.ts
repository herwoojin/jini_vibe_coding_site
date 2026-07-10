// MacroSignal — 신호 계산 엔진 (TRD 5번)
import type { Contributor, MarketScore, MarketWeight } from '../types';
import { computeZScore } from './normalize';

/**
 * 임계값 T — SIGNAL_THRESHOLD 환경변수로 조정 가능 (TRD 5).
 *
 * 기본값 1.5 는 2026-07-10 백테스트(scripts/calibrate-threshold.ts, 3시장 1,064표본,
 * 2024-11~2026-07) 결과다: 커버리지 31%, green 적중 66.5%(기저 상승확률 59.1%),
 * red 적중 49.1%(기저 하락확률 40.9%). 강세장 표본이라 red 의 절대 적중률은 낮다 —
 * 기저 대비 개선폭(+8%p)으로 채택했으며 투자 등급의 검증이 아니다.
 */
const DEFAULT_THRESHOLD = Number(process.env.SIGNAL_THRESHOLD) || 1.5;

interface IndicatorInput {
  code: string;
  name: string;
  currentDelta: number;
  historicalDeltas: number[];
}

/**
 * 단일 시장의 스코어를 계산
 *
 * 1) 정규화: z = (Δ - μ_Δ) / σ_Δ
 * 2) 기여: contrib(m,i) = z_i × weight(m,i) × sign(m,i)
 * 3) 스코어: score(m) = Σ_i contrib(m,i)
 * 4) 레벨: score ≥ +T → green / |score| < T → yellow / score ≤ −T → red
 */
export function computeMarketScore(
  marketCode: string,
  marketName: string,
  weights: MarketWeight[],
  indicatorInputs: Map<number, IndicatorInput>,
  threshold: number = DEFAULT_THRESHOLD,
): MarketScore {
  const contributors: Contributor[] = [];

  for (const w of weights) {
    const input = indicatorInputs.get(w.indicator_id);
    if (!input) continue;

    const z = computeZScore(input.currentDelta, input.historicalDeltas);
    const contrib = z * w.weight * w.sign;

    contributors.push({
      indicator_code: input.code,
      indicator_name: input.name,
      z_score: Math.round(z * 100) / 100,
      weight: w.weight,
      sign: w.sign,
      contrib: Math.round(contrib * 100) / 100,
    });
  }

  // 기여도 절대값 기준 내림차순 정렬
  contributors.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));

  const score = contributors.reduce((sum, c) => sum + c.contrib, 0);
  const roundedScore = Math.round(score * 100) / 100;

  let level: 'green' | 'yellow' | 'red';
  if (roundedScore >= threshold) {
    level = 'green';
  } else if (roundedScore <= -threshold) {
    level = 'red';
  } else {
    level = 'yellow';
  }

  return {
    market_code: marketCode,
    market_name: marketName,
    score: roundedScore,
    level,
    contributors,
  };
}

/**
 * 레벨에 대응하는 이모지 반환
 */
export function levelEmoji(level: 'green' | 'yellow' | 'red'): string {
  switch (level) {
    case 'green': return '🟢';
    case 'yellow': return '🟡';
    case 'red': return '🔴';
  }
}

/**
 * 레벨에 대한 한글 라벨
 */
export function levelLabel(level: 'green' | 'yellow' | 'red'): string {
  switch (level) {
    case 'green': return '우호적';
    case 'yellow': return '중립';
    case 'red': return '경계';
  }
}
