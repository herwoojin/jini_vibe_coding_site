// MacroSignal — 미 증시 업종별(섹터) 스냅샷
//
// SPDR 섹터 ETF 전일 등락률로 "밤사이 어느 업종이 주도했나"를 보여준다.
// Twelve Data 무료 티어에서 실측 확인된 심볼들이며, 배치(콤마) 1회 호출로 8개를 받는다.
// 하루 1회(05:30 슬롯)만 호출하므로 분당 8콜·일 800콜 한도에 안전하다.

interface TwelveQuote {
  close?: string;
  percent_change?: string;
  status?: string;
}

/** 한국 증시 관점에서 중요도가 높은 8개 섹터 (분당 8콜 한도에 맞춤) */
const SECTORS: { code: string; name: string; korea: string }[] = [
  { code: 'XLK', name: '기술', korea: '반도체·IT' },
  { code: 'XLC', name: '커뮤니케이션', korea: '인터넷·미디어' },
  { code: 'XLY', name: '경기소비재', korea: '자동차·유통' },
  { code: 'XLF', name: '금융', korea: '은행·증권' },
  { code: 'XLI', name: '산업재', korea: '기계·조선' },
  { code: 'XLE', name: '에너지', korea: '정유·화학' },
  { code: 'XLB', name: '소재', korea: '철강·2차전지 소재' },
  { code: 'XLV', name: '헬스케어', korea: '바이오·제약' },
];

export interface SectorQuote {
  code: string;
  /** 섹터명(한글) */
  name: string;
  /** 대응하는 국내 업종 힌트 */
  korea: string;
  changePct: number;
}

export interface SectorSnapshot {
  /** 등락률 내림차순 (주도 섹터가 앞) */
  sectors: SectorQuote[];
}

/**
 * 섹터 ETF 등락률을 배치로 1회 조회한다. 키가 없거나 실패하면 null —
 * 밤사이 분석은 섹터 없이도(지수 상대강도만으로) 동작해야 한다.
 */
export async function fetchSectorSnapshot(): Promise<SectorSnapshot | null> {
  const key = process.env.TWELVEDATA_KEY;
  if (!key) return null;

  const symbols = SECTORS.map(s => s.code).join(',');
  const url = `https://api.twelvedata.com/quote?symbol=${symbols}&apikey=${key}`;

  try {
    // 하루 1회라 캐시가 필수는 아니지만, 재생성 폭주를 대비해 1시간 캐시를 건다.
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`TwelveData HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, TwelveQuote>;

    const sectors: SectorQuote[] = [];
    for (const s of SECTORS) {
      const q = data[s.code];
      const pct = q ? Number(q.percent_change) : NaN;
      if (q && q.status !== 'error' && Number.isFinite(pct)) {
        sectors.push({ code: s.code, name: s.name, korea: s.korea, changePct: pct });
      }
    }

    if (sectors.length < 4) return null; // 절반도 못 받으면 신뢰할 수 없다
    sectors.sort((a, b) => b.changePct - a.changePct);
    return { sectors };
  } catch (err) {
    console.error('[sectors] 섹터 조회 실패:', err);
    return null;
  }
}
