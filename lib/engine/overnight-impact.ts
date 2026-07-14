// MacroSignal — 밤사이 미국 지표가 오늘 한국 증시에 미칠 영향 (규칙 기반)
//
// Gemini 가 아니라 규칙 엔진으로 만든다: 이 패널은 하루 종일 보이는데 AI 는 3회만 돌고,
// TRD 6 도 "판단은 규칙엔진이 하고 AI 는 문장화(부가)"로 정의한다.
// 신호 엔진이 이미 계산한 기여도(contrib = z × weight × sign)를 그대로 재사용하므로,
// 여기서 방향을 새로 판단하지 않는다 — 화면의 두 숫자가 어긋날 여지를 없앤다.
import type { MacroCardData, MarketScore } from '../types';

export interface ImpactFactor {
  /** 지표명 + 실제 변화율. 예: "원달러 환율 -0.4%" */
  label: string;
  /** 코스피에 미치는 방향 설명 */
  detail: string;
  positive: boolean;
}

export interface OvernightImpact {
  /** 한 줄 요약 */
  summary: string;
  tone: 'positive' | 'negative' | 'mixed';
  factors: ImpactFactor[];
}

/** 지표별 "왜 그 방향인가"를 한국 증시 관점에서 서술한다. */
function explain(code: string, rising: boolean): string {
  switch (code) {
    case 'USD/KRW':
      return rising ? '원화 약세 → 외국인 매도 압력' : '원화 강세 → 외국인 수급 우호';
    case 'DGS10':
      return rising ? '미 금리 상승 → 성장주 밸류에이션 부담' : '미 금리 하락 → 위험자산 선호';
    case 'NASDAQCOM':
      return rising ? '미 기술주 강세 → 국내 반도체·IT 동조 기대' : '미 기술주 약세 → 국내 IT 조정 압력';
    case 'WTI':
    case 'XBR':
      return rising ? '유가 상승 → 정유·화학 원가 부담, 물가 자극' : '유가 하락 → 원가 부담 완화';
    case 'DXY':
      return rising ? '달러 강세 → 신흥국 자금 이탈 우려' : '달러 약세 → 신흥국 자금 유입 우호';
    case 'VIX':
      return rising ? '변동성 급등 → 위험 회피 심리 확산' : '변동성 안정 → 위험 선호 회복';
    default:
      return rising ? '상승' : '하락';
  }
}

/**
 * 코스피 신호의 기여도 상위 요인을 밤사이 실제 변화율과 엮어 영향 요약을 만든다.
 * 실측 신호(live)가 없으면 null — 목업 위에 그럴듯한 해설을 얹지 않는다.
 */
export function buildOvernightImpact(
  signals: MarketScore[],
  cards: MacroCardData[],
): OvernightImpact | null {
  const kospi = signals.find(s => s.market_code === 'kospi');
  if (!kospi || kospi.contributors.length === 0) return null;

  const factors: ImpactFactor[] = [];

  for (const c of kospi.contributors.slice(0, 4)) {
    const card = cards.find(x => x.indicator.code === c.indicator_code);
    if (!card || card.origin !== 'live') continue;

    const pct = card.changePct;
    const rising = c.z_score >= 0;
    factors.push({
      label: `${c.indicator_name} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
      detail: explain(c.indicator_code, rising),
      // contrib 부호가 곧 코스피에 대한 영향 방향이다 (sign 이 이미 반영돼 있다).
      positive: c.contrib >= 0,
    });
  }

  if (factors.length === 0) return null;

  const pos = factors.filter(f => f.positive).length;
  const neg = factors.length - pos;
  const tone: OvernightImpact['tone'] =
    kospi.level === 'green' ? 'positive' : kospi.level === 'red' ? 'negative' : 'mixed';

  const head =
    tone === 'positive'
      ? '밤사이 미국 지표는 오늘 한국 증시에 전반적으로 우호적입니다.'
      : tone === 'negative'
        ? '밤사이 미국 지표는 오늘 한국 증시에 부담으로 작용할 수 있습니다.'
        : '밤사이 미국 지표의 영향은 호재와 악재가 엇갈립니다.';

  const summary =
    `${head} 상위 요인 ${factors.length}개 중 우호 ${pos}개 · 부담 ${neg}개이며, ` +
    `코스피 신호 스코어는 ${kospi.score >= 0 ? '+' : ''}${kospi.score.toFixed(2)}입니다.`;

  return { summary, tone, factors };
}
