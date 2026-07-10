// MacroSignal — 롤링 상관계수 (TRD 5 / TASK T2-2)
import type { Bar } from '../types';

/** 시계열 → { 날짜: 전일대비 변동 } (각 시계열의 자체 거래일 기준) */
export function toDeltaMap(bars: Bar[]): Map<string, number> {
  const deltas = new Map<string, number>();
  for (let i = 1; i < bars.length; i++) {
    deltas.set(bars[i].ts, bars[i].close - bars[i - 1].close);
  }
  return deltas;
}

/** 피어슨 상관계수. 표본이 부족하거나 분산이 0이면 null. */
export function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;

  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n;

  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/** 통계적으로 의미를 두는 최소 공통 표본 수 */
export const MIN_OVERLAP = 30;

/**
 * 두 시계열의 변동 상관.
 * 한·미 거래일이 달라 행 자체가 어긋나므로, 각자의 달력으로 변동을 만든 뒤
 * 공통 날짜만 짝지어 계산한다. 겹침이 MIN_OVERLAP 미만이면 null.
 */
export function correlateBars(a: Bar[], b: Bar[]): number | null {
  const da = toDeltaMap(a);
  const db = toDeltaMap(b);

  const xs: number[] = [];
  const ys: number[] = [];
  for (const [ts, dv] of da) {
    const other = db.get(ts);
    if (other !== undefined) { xs.push(dv); ys.push(other); }
  }
  if (xs.length < MIN_OVERLAP) return null;
  return pearson(xs, ys);
}
