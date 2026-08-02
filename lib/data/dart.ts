// MacroSignal — DART(전자공시) 배당 공시 정보
//
// ⚠️ DART 정형 API 는 '배당기준일(배당락일)'을 제공하지 않는다 (실측 확인).
// 확정 배당기준일은 현금·현물배당결정 주요사항보고서 '문서 본문'에만 있고
// alotMatter API 로는 나오지 않는다. 따라서 캘린더 날짜는 여전히 추정이며,
// 여기서는 '배당의 지속가능성'을 판단할 공시 원본 수치만 가져온다.
//
// 배당성향(순이익 중 배당 비율)이 핵심이다. 배당수익률이 높아도 배당성향이
// 100% 에 가까우면 이익을 넘겨 배당하는 것이라 삭감 위험이 크다.

const BASE = 'https://opendart.fss.or.kr/api/alotMatter.json';
const ONE_DAY = 86_400;

/** 종목코드(Yahoo 심볼) → DART 고유번호. 공식 corpCode.xml 에서 추출 (2026-08 기준). */
const CORP_CODES: Record<string, string> = {
  '030200.KS': '00190321', // 케이티
  '015760.KS': '00159193', // 한국전력공사
  '316140.KS': '01350869', // 우리금융지주
  '086790.KS': '00547583', // 하나금융지주
  '033780.KS': '00244455', // 케이티앤지
  '005490.KS': '00155319', // POSCO홀딩스
  '055550.KS': '00382199', // 신한지주
  '105560.KS': '00688996', // KB금융
  '024110.KS': '00149646', // 기업은행
  '017670.KS': '00159023', // SK텔레콤
  '323410.KS': '01133217', // 카카오뱅크
  '005930.KS': '00126380', // 삼성전자
};

interface DartRow {
  se: string; // 항목명
  stock_knd: string; // 보통주 / 우선주 / -
  thstrm: string; // 당기
  frmtrm: string; // 전기
  stlm_dt: string; // 결산기준일
}

export interface DartDividend {
  /** 공시 사업연도 */
  year: number;
  /** 결산기준일 (예: 2025-12-31) */
  settlementDate: string;
  /** 배당성향(%) — 순이익 중 배당 비율. 낮을수록 여력이 크다 */
  payoutRatio: number | null;
  /** 공시 기준 연간 배당수익률(%) — 보통주 */
  officialYield: number | null;
  /** 공시 기준 주당 배당금(원) — 보통주 */
  dividendPerShare: number | null;
  /** 직전 사업연도 배당성향 — 추세 비교용 */
  prevPayoutRatio: number | null;
}

/** "25.10" · "1,668" · "-" → 숫자 (없으면 null) */
function num(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/,/g, '').trim();
  if (!cleaned || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pick(rows: DartRow[], match: (se: string) => boolean, common = true): DartRow | undefined {
  return rows.find(
    r => match(r.se) && (!common || r.stock_knd === '보통주' || r.stock_knd === '-'),
  );
}

/**
 * 한 종목의 배당 공시 정보를 가져온다.
 * DART 는 에러도 HTTP 200 + status 코드로 주므로 본문 검사가 필수다
 * (010=인증키 오류, 013=데이터 없음, 020=요청한도 초과).
 */
export async function fetchDartDividend(
  symbol: string,
  year: number,
): Promise<DartDividend | null> {
  const key = process.env.DART_KEY;
  const corpCode = CORP_CODES[symbol];
  if (!key || !corpCode) return null;

  const url = `${BASE}?crtfc_key=${key}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=11011`;

  try {
    const res = await fetch(url, { next: { revalidate: ONE_DAY } });
    if (!res.ok) throw new Error(`DART HTTP ${res.status}`);

    const json = await res.json();
    if (json.status !== '000') {
      // 013(데이터 없음)은 정상적인 상황 — 아직 공시 전이거나 배당이 없는 해다.
      if (json.status !== '013') {
        console.error(`[dart] ${symbol} ${year}: [${json.status}] ${json.message}`);
      }
      return null;
    }

    const rows: DartRow[] = json.list ?? [];
    if (rows.length === 0) return null;

    const payout = pick(rows, se => se.includes('현금배당성향'));
    const yieldRow = pick(rows, se => se.includes('현금배당수익률'));
    const dps = pick(rows, se => se.includes('주당 현금배당금'));

    return {
      year,
      settlementDate: rows[0].stlm_dt ?? '',
      payoutRatio: num(payout?.thstrm),
      officialYield: num(yieldRow?.thstrm),
      dividendPerShare: num(dps?.thstrm),
      prevPayoutRatio: num(payout?.frmtrm),
    };
  } catch (err) {
    console.error(`[dart] ${symbol} ${year} 조회 실패:`, err);
    return null;
  }
}

/**
 * 최신 공시 연도를 자동으로 찾는다.
 * 사업보고서는 결산 후 3개월쯤 뒤에 나오므로, 올해 것이 없으면 작년으로 내려간다.
 */
export async function fetchLatestDartDividend(
  symbol: string,
  now: Date = new Date(),
): Promise<DartDividend | null> {
  const thisYear = now.getFullYear();
  for (const year of [thisYear - 1, thisYear - 2]) {
    const d = await fetchDartDividend(symbol, year);
    if (d) return d;
  }
  return null;
}

export const DART_SUPPORTED = (symbol: string) => symbol in CORP_CODES;
