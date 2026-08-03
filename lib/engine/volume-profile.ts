// MacroSignal — 매물대(거래량 집중 가격대) 계산
//
// AI 에게 "매물대가 어디냐"고 물으면 검색으로 찾지 못해 "정보 부족"이라 답하거나
// 그럴듯한 숫자를 지어낸다. 매물대는 추측할 대상이 아니라 계산할 대상이다:
// 실제 거래량을 가격 구간별로 쌓으면 어느 가격대에 물량이 몰려 있는지 그대로 나온다.
import type { YahooBar } from '../data/yahoo';

export interface VolumeNode {
  /** 구간 하단 가격 */
  low: number;
  /** 구간 상단 가격 */
  high: number;
  /** 이 구간에서 거래된 비중(%) */
  sharePct: number;
}

export interface VolumeProfile {
  /** 거래량이 가장 많이 몰린 가격대 (POC — Point of Control) */
  poc: VolumeNode;
  /** 현재가 위의 저항 매물대 (많은 순) */
  resistance: VolumeNode[];
  /** 현재가 아래의 지지 매물대 (많은 순) */
  support: VolumeNode[];
  /** 전체 거래량의 70% 가 몰린 가격 범위 */
  valueArea: { low: number; high: number };
  /** 계산에 쓴 거래일 수 */
  days: number;
}

const BUCKETS = 24;

/**
 * 최근 N 거래일의 거래량을 가격 구간으로 나눠 매물대를 만든다.
 *
 * 각 봉의 거래량을 그 봉의 고가~저가 구간에 균등 분배한다.
 * (분봉 데이터가 없으므로 일봉 내 분포는 균등으로 가정 — 업계 표준 근사)
 */
export function computeVolumeProfile(bars: YahooBar[], lookback = 120): VolumeProfile | null {
  const window = bars.slice(-lookback).filter(b => b.volume > 0 && b.high >= b.low);
  if (window.length < 20) return null;

  const min = Math.min(...window.map(b => b.low));
  const max = Math.max(...window.map(b => b.high));
  if (!(max > min)) return null;

  const size = (max - min) / BUCKETS;
  const volumes = new Array<number>(BUCKETS).fill(0);

  for (const b of window) {
    // 봉의 가격 범위에 걸친 구간들에 거래량을 나눠 담는다.
    const from = Math.max(0, Math.floor((b.low - min) / size));
    const to = Math.min(BUCKETS - 1, Math.floor((b.high - min) / size));
    const span = to - from + 1;
    for (let i = from; i <= to; i++) volumes[i] += b.volume / span;
  }

  const total = volumes.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;

  const node = (i: number): VolumeNode => ({
    low: min + i * size,
    high: min + (i + 1) * size,
    sharePct: (volumes[i] / total) * 100,
  });

  const pocIndex = volumes.indexOf(Math.max(...volumes));

  // Value Area: POC 에서 양옆으로 넓혀 전체의 70% 를 담는 구간
  let lo = pocIndex;
  let hi = pocIndex;
  let acc = volumes[pocIndex];
  while (acc / total < 0.7 && (lo > 0 || hi < BUCKETS - 1)) {
    const left = lo > 0 ? volumes[lo - 1] : -1;
    const right = hi < BUCKETS - 1 ? volumes[hi + 1] : -1;
    if (right >= left) {
      hi++;
      acc += volumes[hi];
    } else {
      lo--;
      acc += volumes[lo];
    }
  }

  const price = window[window.length - 1].close;
  const ranked = volumes
    .map((_, i) => i)
    .sort((a, b) => volumes[b] - volumes[a])
    .map(node);

  return {
    poc: node(pocIndex),
    resistance: ranked.filter(n => n.low > price).slice(0, 2),
    support: ranked.filter(n => n.high < price).slice(0, 2),
    valueArea: { low: min + lo * size, high: min + (hi + 1) * size },
    days: window.length,
  };
}

/** 프롬프트·UI 에 넣을 한 줄 요약 */
export function describeVolumeProfile(vp: VolumeProfile, currency: string): string {
  const f = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const unit = currency === 'KRW' ? '원' : '';
  const parts = [
    `최대 거래 밀집 ${f(vp.poc.low)}~${f(vp.poc.high)}${unit}(전체의 ${vp.poc.sharePct.toFixed(1)}%)`,
    `주요 거래 구간 ${f(vp.valueArea.low)}~${f(vp.valueArea.high)}${unit}`,
  ];
  if (vp.support.length > 0) {
    parts.push(`아래 지지 ${vp.support.map(s => `${f(s.low)}~${f(s.high)}`).join(', ')}${unit}`);
  }
  if (vp.resistance.length > 0) {
    parts.push(`위 저항 ${vp.resistance.map(s => `${f(s.low)}~${f(s.high)}`).join(', ')}${unit}`);
  }
  return `${parts.join(' / ')} (최근 ${vp.days}거래일 실거래량 기준)`;
}
