// MacroSignal — Z-score 정규화 (TRD 5번)

/**
 * 전일대비 변동들의 Z-score를 계산
 * z = (Δ - μ_Δ) / σ_Δ
 */
export function zScore(delta: number, mean: number, stddev: number): number {
  if (stddev === 0) return 0;
  return (delta - mean) / stddev;
}

/**
 * 배열에서 평균 계산
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 배열에서 표준편차 계산
 */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * 과거 변동 배열에서 현재 값의 Z-score를 계산
 */
export function computeZScore(currentDelta: number, historicalDeltas: number[]): number {
  const m = mean(historicalDeltas);
  const s = stddev(historicalDeltas);
  return zScore(currentDelta, m, s);
}
