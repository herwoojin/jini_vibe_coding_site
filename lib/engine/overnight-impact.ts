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
  /** 이 지표가 밤사이 오른 것인지 내린 것인지 (한 단어) */
  move: string;
  /** 왜 그렇게 판단했는지 — 지표→시장 연결 고리 (한 줄) */
  detail: string;
  /** 주식 초보자용 풀이 — 이 움직임이 오늘 한국 증시에 어떤 의미인지 */
  plain: string;
  positive: boolean;
}

export interface OvernightImpact {
  /** 한 줄 요약 */
  summary: string;
  tone: 'positive' | 'negative' | 'mixed';
  factors: ImpactFactor[];
}

interface Explanation {
  move: string;
  detail: string;
  plain: string;
}

/**
 * 지표별 "왜 그 방향인가" + 초보자용 풀이를 만든다.
 * detail = 전문 용어 한 줄, plain = 초보자가 이해할 수 있는 쉬운 설명.
 */
function explain(code: string, rising: boolean): Explanation {
  switch (code) {
    case 'USD/KRW':
      return rising
        ? {
            move: '원달러 환율 상승(원화 약세)',
            detail: '원화 약세 → 외국인 매도 압력',
            plain:
              '환율이 오르면 원화 가치가 떨어진 것입니다. 외국인 투자자는 한국 주식을 팔아 달러로 바꿀 때 손해를 보게 되어, 매도(팔자)에 나서기 쉽습니다. 외국인이 팔면 코스피가 눌릴 수 있어요.',
          }
        : {
            move: '원달러 환율 하락(원화 강세)',
            detail: '원화 강세 → 외국인 수급 우호',
            plain:
              '환율이 내리면 원화 가치가 오른 것입니다. 외국인이 한국 주식을 사서 나중에 달러로 바꿀 때 환차익까지 기대할 수 있어, 외국인 매수(사자) 자금이 들어오기 좋은 환경입니다. 코스피에 우호적이에요.',
          };
    case 'DGS10':
      return rising
        ? {
            move: '미국 10년물 국채금리 상승',
            detail: '미 금리 상승 → 성장주 밸류에이션 부담',
            plain:
              '미국 금리가 오르면 안전한 예금·채권 이자가 늘어, 위험한 주식의 매력이 상대적으로 줄어듭니다. 특히 미래 성장 기대로 비싸게 거래되는 성장주(반도체·바이오·2차전지 등)가 먼저 부담을 받습니다. 코스피·코스닥에 악재로 작용하기 쉽습니다.',
          }
        : {
            move: '미국 10년물 국채금리 하락',
            detail: '미 금리 하락 → 위험자산 선호',
            plain:
              '미국 금리가 내리면 예금·채권 이자가 줄어, 더 높은 수익을 노린 돈이 주식 같은 위험자산으로 이동합니다. 성장주에 특히 우호적이라 코스피·코스닥에 호재가 되기 쉽습니다.',
          };
    case 'NASDAQCOM':
      return rising
        ? {
            move: '나스닥(미 기술주) 상승',
            detail: '미 기술주 강세 → 국내 반도체·IT 동조 기대',
            plain:
              '나스닥은 미국 기술주 중심 지수입니다. 밤사이 미국 기술주가 오르면, 삼성전자·SK하이닉스 같은 국내 반도체·IT 종목도 따라 오르는 경향(동조화)이 있습니다. 오늘 코스피 개장에 긍정적 신호예요.',
          }
        : {
            move: '나스닥(미 기술주) 하락',
            detail: '미 기술주 약세 → 국내 IT 조정 압력',
            plain:
              '밤사이 미국 기술주가 내리면, 국내 반도체·IT 종목도 따라 약해지는 경향이 있습니다. 코스피·코스닥이 미국장을 따라 하락 출발할 가능성이 있습니다.',
          };
    case 'WTI':
    case 'XBR':
      return rising
        ? {
            move: '국제 유가 상승',
            detail: '유가 상승 → 정유·화학 원가 부담, 물가 자극',
            plain:
              '유가가 오르면 정유·화학·항공처럼 기름을 많이 쓰는 기업은 원가 부담이 커집니다. 물가를 자극해 금리 인하를 늦출 수 있다는 점도 증시엔 부담입니다. 다만 정유주 자체엔 호재라 업종별로 갈립니다.',
          }
        : {
            move: '국제 유가 하락',
            detail: '유가 하락 → 원가 부담 완화',
            plain:
              '유가가 내리면 기름을 많이 쓰는 기업들의 비용이 줄어 실적에 도움이 됩니다. 물가 부담도 낮춰 증시 전반에 우호적입니다.',
          };
    case 'DXY':
      return rising
        ? {
            move: '달러 강세',
            detail: '달러 강세 → 신흥국 자금 이탈 우려',
            plain:
              '달러가 강해지면 글로벌 투자자금이 안전한 미국으로 몰리면서, 한국 같은 신흥국 시장에서 돈이 빠져나가는 경향이 있습니다. 외국인 매도로 이어질 수 있어 코스피에 부담입니다.',
          }
        : {
            move: '달러 약세',
            detail: '달러 약세 → 신흥국 자금 유입 우호',
            plain:
              '달러가 약해지면 상대적으로 신흥국 자산의 매력이 커져, 한국 증시로 외국인 자금이 들어오기 좋은 환경입니다. 코스피에 우호적입니다.',
          };
    case 'VIX':
      return rising
        ? {
            move: 'VIX(공포지수) 급등',
            detail: '변동성 급등 → 위험 회피 심리 확산',
            plain:
              'VIX는 시장의 불안 정도를 나타내 "공포지수"라 부릅니다. 이 값이 뛰면 투자자들이 겁을 먹고 위험한 주식을 줄이려 합니다. 한국 증시도 함께 출렁일(변동성 확대) 수 있습니다.',
          }
        : {
            move: 'VIX(공포지수) 안정',
            detail: '변동성 안정 → 위험 선호 회복',
            plain:
              'VIX가 내리면 시장 불안이 가라앉은 것입니다. 투자자들이 안심하고 주식 비중을 늘리려는 분위기라, 한국 증시에도 우호적입니다.',
          };
    default:
      return {
        move: rising ? '상승' : '하락',
        detail: rising ? '상승' : '하락',
        plain: '',
      };
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
    const ex = explain(c.indicator_code, rising);
    factors.push({
      label: `${c.indicator_name} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
      move: ex.move,
      detail: ex.detail,
      plain: ex.plain,
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
