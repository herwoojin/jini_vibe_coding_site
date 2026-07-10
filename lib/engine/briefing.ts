// MacroSignal — 규칙 기반 브리핑 (TRD 6 의 폴백 경로)
//
// TRD: "판단은 규칙엔진이 이미 한 것을 문장화. AI는 부가, 핵심 아님."
// Anthropic 키가 생기면 이 함수 출력 대신 fn-briefing 결과를 쓰면 된다.
import type { MarketScore, Contributor } from '../types';
import { levelLabel } from './signal';

function direction(c: Contributor): string {
  const rising = c.z_score >= 0;
  switch (c.indicator_code) {
    case 'DGS10': return rising ? '미 금리 상승 부담' : '미 금리 하락 안도';
    case 'KR3Y': return rising ? '국내 금리 상승 부담' : '국내 금리 안정';
    case 'USD/KRW': return rising ? '원화 약세 부담' : '원화 강세 우호';
    case 'USD/JPY': return rising ? '엔화 약세' : '엔화 강세';
    case 'DXY': return rising ? '달러 강세 부담' : '달러 약세 우호';
    case 'WTI': case 'XBR': return rising ? '유가 상승 부담' : '유가 하락 안도';
    case 'NASDAQCOM': return rising ? '미 기술주 강세 우호' : '미 기술주 약세 부담';
    default: return `${c.indicator_name} ${rising ? '상승' : '하락'}`;
  }
}

/**
 * 스코어·기여도에서 결정적(같은 입력→같은 문장) 브리핑을 만든다.
 * 값 판단은 하지 않는다 — 엔진이 이미 내린 판단을 서술할 뿐이다.
 */
export function ruleBasedBriefing(s: MarketScore): string {
  const top = s.contributors.slice(0, 3);
  if (top.length === 0) return '';

  const factors = top.map(c => {
    const dir = direction(c);
    const eff = c.contrib >= 0 ? '긍정' : '부정';
    return `${dir}(기여 ${c.contrib >= 0 ? '+' : ''}${c.contrib.toFixed(2)}, ${eff} 요인)`;
  });

  const head =
    s.level === 'green'
      ? `거시 환경이 ${s.market_name}에 우호적입니다.`
      : s.level === 'red'
        ? `거시 환경이 ${s.market_name}에 부담으로 작용하고 있습니다.`
        : `${s.market_name}에 대한 거시 신호가 혼재되어 있습니다.`;

  return (
    `${head} 종합 스코어 ${s.score >= 0 ? '+' : ''}${s.score.toFixed(2)} (${levelLabel(s.level)}). ` +
    `주요 요인: ${factors.join(', ')}. ` +
    `전일 종가 기반 지표로 계산된 규칙 기반 진단이며, 투자 권유가 아닙니다.`
  );
}
