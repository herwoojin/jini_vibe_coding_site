// MacroSignal — 데이터 신뢰도 알림
//
// 돈에 관한 화면이므로 "값이 왜 비었는지 / 왜 낮춰졌는지 / 왜 오래됐는지"를
// 사용자가 추측하게 두지 않는다. 품질이 떨어진 지점마다 알림을 만들어 화면에 띄운다.

export type NoticeLevel = 'error' | 'warn' | 'info';

export interface DataNotice {
  level: NoticeLevel;
  /** 한 줄 제목 */
  title: string;
  /** 왜 그런지 + 사용자가 뭘 하면 되는지 */
  detail: string;
}

export const notice = (level: NoticeLevel, title: string, detail: string): DataNotice => ({
  level,
  title,
  detail,
});

// === 자주 쓰는 알림들 (문구를 한 곳에서 관리한다) ===

export const NOTICES = {
  ungrounded: () =>
    notice(
      'error',
      '실시간 검색 근거를 확보하지 못했습니다',
      'Google 검색이 수행되지 않아 뉴스·공시·섹터 판단을 신뢰할 수 없습니다. 표시된 내용을 투자 판단에 사용하지 마시고, 잠시 후 다시 시도해 주세요.',
    ),

  priceUnavailable: (count: number) =>
    notice(
      'warn',
      `${count}개 종목의 가격 정보를 확인하지 못했습니다`,
      '검색에서 현재가를 찾지 못해 진입가·목표가·손절가를 비우고 "관망"으로 낮췄습니다. 추정 가격을 지어내는 대신 비워 둔 것이므로, 매매하시려면 증권사 HTS/MTS 에서 직접 확인하세요.',
    ),

  confidenceDowngraded: (count: number) =>
    notice(
      'info',
      `${count}개 종목을 신뢰도 미달로 "관망" 처리했습니다`,
      'AI 신뢰도가 0.65 이하인 매수·매도 권고는 자동으로 관망으로 낮춥니다. 근거가 약한 신호를 매매 권고처럼 보이지 않게 하기 위한 장치입니다.',
    ),

  priceInconsistent: () =>
    notice(
      'warn',
      'AI 가 제시한 가격이 서로 모순되어 조정했습니다',
      '목표가가 진입가보다 낮거나 현재가와 지나치게 동떨어져 신뢰할 수 없는 값이었습니다. 해당 가격을 비우고 관망으로 낮췄습니다.',
    ),

  tickerUnverified: (names: string[]) =>
    notice(
      'warn',
      `종목코드를 확인하지 못한 종목이 ${names.length}개 있습니다`,
      `${names.slice(0, 4).join(', ')}${names.length > 4 ? ' 외' : ''} — AI 가 알려준 종목코드가 실제로 존재하는지 확인되지 않아 개별 분석 버튼을 막았습니다. 잘못된 코드로 엉뚱한 회사를 분석하는 것을 방지하기 위함입니다.`,
    ),

  stale: (when: string) =>
    notice(
      'warn',
      '이번 조회에 실패해 직전 결과를 보여드립니다',
      `표시된 내용은 ${when} 기준이며 지금 시장 상황과 다를 수 있습니다.`,
    ),

  cached: (minutes: number) =>
    notice(
      'info',
      '캐시된 결과입니다',
      `호출 비용을 아끼기 위해 ${minutes}분 단위로 캐시합니다. 최신 상태가 필요하면 잠시 후 다시 스캔하세요.`,
    ),

  preMarket: (target: string) =>
    notice(
      'info',
      `직전 거래일(${target}) 기준입니다`,
      '지금은 장 시작 전이거나 휴장일이라 오늘 데이터가 없습니다. 개장 후 다시 스캔하면 당일 흐름이 반영됩니다.',
    ),

  rateLimited: () =>
    notice(
      'error',
      '데이터 제공처가 일시적으로 요청을 제한하고 있습니다',
      'Yahoo Finance 가 짧은 시간에 많은 요청을 받아 응답을 거부했습니다(429). 1~2분 뒤에 다시 시도하면 정상 동작합니다.',
    ),

  timeout: () =>
    notice(
      'error',
      '분석 시간이 초과되었습니다',
      '검색과 분석에 30~60초가 걸리는데 그 안에 끝나지 않았습니다. 배포 환경의 실행 시간 제한에 걸렸을 수 있습니다. 다시 시도해 주세요.',
    ),

  analysisFailed: (reason: string) =>
    notice(
      'error',
      '분석을 완료하지 못했습니다',
      `${reason} — 표시할 결과가 없으므로 어떤 수치도 신뢰하지 마십시오. 잠시 후 다시 시도해 주세요.`,
    ),

  slowOperation: (seconds: number) =>
    notice(
      'info',
      `이번 분석에 ${seconds}초 걸렸습니다`,
      '실시간 검색을 포함해 시간이 오래 걸립니다. 배포 환경의 함수 실행 제한(무료 티어 10초)에 걸리면 실패할 수 있습니다.',
    ),
} as const;
