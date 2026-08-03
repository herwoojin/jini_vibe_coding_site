// MacroSignal — 종목명 → 종목코드 검색 (DART 공식 매핑)
//
// ⚠️ AI 에게 종목코드를 물으면 틀린 코드를 준다(실측: 로보티즈를 270580 이라 했으나
// 실제는 108490). 엉뚱한 회사를 분석하면 치명적이므로, 금융위 전자공시(DART)가
// 배포하는 공식 corpCode.xml 을 내려받아 이름↔코드를 매핑한다.
//
// 주의: corpCode.xml 에는 상장폐지된 회사도 남아 있다. 따라서 검색 결과를
// 그대로 쓰지 않고, 분석 직전에 Yahoo 로 실존을 한 번 더 확인한다.
import { inflateRawSync } from 'zlib';
import { storeGet, storeSet } from '../ai/store';

const CORP_CODE_URL = 'https://opendart.fss.or.kr/api/corpCode.xml';
const STORE_KEY = 'corp:listed-v1';

export interface CorpEntry {
  /** 6자리 종목코드 */
  code: string;
  /** 회사명 */
  name: string;
}

let memoryCache: CorpEntry[] | null = null;

/** 단일 엔트리 ZIP 을 내장 zlib 으로 푼다 (새 의존성 없이). */
function unzipSingle(buf: Buffer): string {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP 형식이 아닙니다');
  const method = buf.readUInt16LE(8);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  const body = buf.subarray(start);
  return method === 8 ? inflateRawSync(body).toString('utf8') : body.toString('utf8');
}

/** 상장사(종목코드가 있는 회사)만 뽑는다. */
function parseListed(xml: string): CorpEntry[] {
  const re =
    /<corp_name>([^<]*)<\/corp_name>\s*<corp_eng_name>[^<]*<\/corp_eng_name>\s*<stock_code>\s*(\d{6})\s*<\/stock_code>/g;
  const out: CorpEntry[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const name = m[1].trim();
    const code = m[2];
    if (!name || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name });
  }
  return out;
}

/**
 * 상장사 목록을 얻는다. 3.4MB 다운로드 + 27MB 압축해제라 비싸므로
 * 메모리와 저장소에 캐시한다 (회사 목록은 하루에도 거의 바뀌지 않는다).
 */
export async function getListedCompanies(): Promise<CorpEntry[]> {
  if (memoryCache) return memoryCache;

  const cached = await storeGet<CorpEntry[]>(STORE_KEY);
  if (cached && cached.length > 0) {
    memoryCache = cached;
    return cached;
  }

  const key = process.env.DART_KEY;
  if (!key) return [];

  const res = await fetch(`${CORP_CODE_URL}?crtfc_key=${key}`, {
    next: { revalidate: 86_400 },
  });
  if (!res.ok) throw new Error(`DART corpCode HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  // 키가 틀리면 ZIP 이 아니라 JSON 에러가 온다.
  if (buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`DART corpCode 응답이 ZIP 이 아닙니다: ${buf.subarray(0, 120).toString()}`);
  }

  const list = parseListed(unzipSingle(buf));
  if (list.length === 0) throw new Error('상장사 목록을 파싱하지 못했습니다');

  memoryCache = list;
  await storeSet(STORE_KEY, list);
  return list;
}

export interface CorpMatch extends CorpEntry {
  /** 정확도 — 낮을수록 좋은 매치 */
  rank: number;
}

/** 공백·특수문자를 무시하고 비교한다 (예: "SK 텔레콤" → "sk텔레콤") */
const norm = (s: string) => s.replace(/[\s()·,.\-_/]/g, '').toLowerCase();

/**
 * 회사명으로 종목을 찾는다. 완전일치 → 접두일치 → 부분일치 순으로 정렬한다.
 * 종목코드 6자리를 그대로 입력해도 찾을 수 있다.
 */
export async function searchCompanies(query: string, limit = 8): Promise<CorpMatch[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  const list = await getListedCompanies();
  if (list.length === 0) return [];

  // 종목코드로 직접 입력한 경우
  if (/^\d{6}$/.test(q)) {
    const hit = list.find(c => c.code === q);
    return hit ? [{ ...hit, rank: 0 }] : [];
  }

  const nq = norm(q);
  const matches: CorpMatch[] = [];

  for (const c of list) {
    const nn = norm(c.name);
    let rank = -1;
    if (nn === nq) rank = 0;
    else if (nn.startsWith(nq)) rank = 1;
    else if (nn.includes(nq)) rank = 2;
    if (rank >= 0) matches.push({ ...c, rank });
  }

  matches.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length);
  return matches.slice(0, limit);
}
