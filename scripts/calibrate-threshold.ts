/**
 * 임계값 T 백테스트 캘리브레이션 (TRD 5: "초기 백테스트로 캘리브레이션")
 *
 * 실행:  npx tsx scripts/calibrate-threshold.ts   (.env.local 의 키 필요)
 *
 * 방법: 과거 각 거래일 d 에 대해 — 그 시점까지의 데이터만으로 — 신호 스코어를
 * 계산하고(90일 창 z-score, 프로덕션과 동일 산식), 다음 거래일 지수 수익률과
 * 대조한다. T 후보별로 green(≥T)일의 다음날 상승 적중률, red(≤−T)일의 하락
 * 적중률, 판정 커버리지(비중립 비율)를 집계한다.
 */
import { FredAdapter } from '../lib/adapters/fred';
import { EcosAdapter } from '../lib/adapters/ecos';
import { computeZScore } from '../lib/engine/normalize';
import { markets, indicators, marketWeights } from '../lib/mock/data';
import type { Bar } from '../lib/types';

const HISTORY_BARS = 400;
const Z_WINDOW = 90;
const MIN_HISTORY = 20;
const T_CANDIDATES = [0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0];

const MARKET_INDEX: Record<string, string> = {
  kospi: 'KOSPI',
  kosdaq: 'KOSDAQ',
  nasdaq: 'NASDAQCOM',
};

interface DeltaPoint { ts: string; delta: number }

function toDeltas(bars: Bar[]): DeltaPoint[] {
  const out: DeltaPoint[] = [];
  for (let i = 1; i < bars.length; i++) {
    out.push({ ts: bars[i].ts, delta: bars[i].close - bars[i - 1].close });
  }
  return out;
}

/** 평가일 d 기준: 그 시점의 지표 z-score (d 이후 데이터는 절대 보지 않는다) */
function zAt(deltas: DeltaPoint[], d: string): number | null {
  let idx = -1;
  for (let i = deltas.length - 1; i >= 0; i--) {
    if (deltas[i].ts <= d) { idx = i; break; }
  }
  if (idx < MIN_HISTORY) return null;
  const hist = deltas.slice(Math.max(0, idx - Z_WINDOW), idx).map(p => p.delta);
  return computeZScore(deltas[idx].delta, hist);
}

async function main() {
  const fred = new FredAdapter();
  const ecos = new EcosAdapter();
  const source = (code: string) =>
    ['KR3Y', 'BASE_KR', 'USD/KRW', 'USD/JPY', 'KOSPI', 'KOSDAQ'].includes(code) ? ecos : fred;

  // 신호에 쓰이는 지표 + 시장 지수의 장기 시계열 수집
  const needed = new Set<string>(Object.values(MARKET_INDEX));
  for (const w of marketWeights) {
    const ind = indicators.find(i => i.id === w.indicator_id)!;
    needed.add(ind.code);
  }

  const series = new Map<string, Bar[]>();
  for (const code of needed) {
    const bars = await source(code).fetchSeries(code, { interval: '1day', outputsize: HISTORY_BARS });
    series.set(code, bars);
    console.log(`  수집: ${code.padEnd(10)} ${bars.length}개 (${bars[0].ts} ~ ${bars[bars.length - 1].ts})`);
  }

  const indicatorDeltas = new Map<number, DeltaPoint[]>();
  for (const ind of indicators) {
    const bars = series.get(ind.code);
    if (bars) indicatorDeltas.set(ind.id, toDeltas(bars));
  }

  // 시장별 (스코어, 다음날 수익률) 표본 수집
  type Sample = { score: number; nextRet: number };
  const samplesByMarket = new Map<string, Sample[]>();

  for (const market of markets) {
    const idxBars = series.get(MARKET_INDEX[market.code])!;
    const weights = marketWeights.filter(w => w.market_id === market.id);
    const samples: Sample[] = [];

    for (let t = 0; t < idxBars.length - 1; t++) {
      const d = idxBars[t].ts;
      let score = 0;
      let complete = true;
      for (const w of weights) {
        const z = zAt(indicatorDeltas.get(w.indicator_id) ?? [], d);
        if (z === null) { complete = false; break; }
        score += z * w.weight * w.sign;
      }
      if (!complete) continue;
      const nextRet = (idxBars[t + 1].close - idxBars[t].close) / idxBars[t].close;
      samples.push({ score, nextRet });
    }
    samplesByMarket.set(market.code, samples);
    console.log(`  ${market.name}: 유효 표본 ${samples.length}일`);
  }

  // T 후보별 집계 (3시장 합산)
  const all = [...samplesByMarket.values()].flat();
  console.log(`\n총 표본 ${all.length}일 (시장×일). 기저 상승확률: ${(100 * all.filter(s => s.nextRet > 0).length / all.length).toFixed(1)}%\n`);
  console.log('T     | 판정일(커버리지) | green적중(다음날↑) | red적중(다음날↓) | 종합적중');
  console.log('------+------------------+--------------------+------------------+---------');

  for (const T of T_CANDIDATES) {
    const green = all.filter(s => s.score >= T);
    const red = all.filter(s => s.score <= -T);
    const gHit = green.filter(s => s.nextRet > 0).length;
    const rHit = red.filter(s => s.nextRet < 0).length;
    const decided = green.length + red.length;
    const hit = decided > 0 ? (100 * (gHit + rHit)) / decided : 0;
    const cov = (100 * decided) / all.length;
    const gPct = green.length ? ((100 * gHit) / green.length).toFixed(1) : '  — ';
    const rPct = red.length ? ((100 * rHit) / red.length).toFixed(1) : '  — ';
    console.log(
      `${T.toFixed(1).padEnd(5)} | ${String(decided).padStart(4)}일 (${cov.toFixed(1).padStart(5)}%) | ` +
      `${String(green.length).padStart(4)}일 중 ${gPct.padStart(5)}% | ${String(red.length).padStart(4)}일 중 ${rPct.padStart(5)}% | ${hit.toFixed(1).padStart(5)}%`,
    );
  }
}

main().catch(e => { console.error('FAIL:', e); process.exit(1); });
