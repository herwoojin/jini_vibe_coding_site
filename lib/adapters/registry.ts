import type { DataSourceAdapter } from '../types';
import { EcosAdapter } from './ecos';
import { FredAdapter } from './fred';
import { TwelveDataAdapter } from './twelvedata';
import { KisAdapter } from './kis';

// 어댑터 인스턴스 맵
const adapters: Record<string, DataSourceAdapter> = {
  ecos: new EcosAdapter(),
  fred: new FredAdapter(),
  twelvedata: new TwelveDataAdapter(),
  kis: new KisAdapter(),
};

export function getAdapter(id: string): DataSourceAdapter {
  const adapter = adapters[id];
  if (!adapter) throw new Error(`Adapter not found: ${id}`);
  return adapter;
}

// 지표별 Primary / Backup 소스 매핑
//
// realtime=false 는 무료 소스(FRED/ECOS)의 전일 종가다. 장중에는 갱신되지 않는다.
// 환율 primary 가 ecos 인 이유: FRED(DEXKOUS)는 8일 지연, ECOS 는 1일 지연으로 측정됐다.
export const SOURCE_MAP: Record<string, { primary: string; backup: string | null; realtime: boolean }> = {
  // 환율: Twelve Data 무료 티어가 당일 장중 값을 준다(실측 확인). ECOS 는 전일 종가 폴백.
  'USD/KRW':  { primary: 'twelvedata', backup: 'ecos',       realtime: true  },
  'USD/JPY':  { primary: 'twelvedata', backup: 'ecos',       realtime: true  },
  'WTI':      { primary: 'fred',       backup: 'twelvedata', realtime: false },
  'XBR':      { primary: 'fred',       backup: 'twelvedata', realtime: false },
  // ICE DXY 는 무료 소스가 없어 연준 광의 달러지수(DTWEXBGS)로 대체했다(라벨도 변경).
  // 진짜 ICE DXY 가 필요해지면 twelvedata 를 primary 로 되돌릴 것.
  'DXY':      { primary: 'fred',       backup: 'twelvedata', realtime: false },
  'DGS10':    { primary: 'fred',       backup: null,         realtime: false },
  'KR3Y':     { primary: 'ecos',       backup: null,         realtime: false },
  'BASE_KR':  { primary: 'ecos',       backup: null,         realtime: false },
  'FEDFUNDS': { primary: 'fred',       backup: null,         realtime: false },
  'NASDAQCOM':{ primary: 'fred',       backup: 'twelvedata', realtime: false },
  // KIS(실계좌 필요) 없이 ECOS 802Y001 로 국내 지수를 받는다. 장중이 아닌 전일 종가.
  'KOSPI':    { primary: 'ecos',       backup: 'kis',        realtime: false },
  'KOSDAQ':   { primary: 'ecos',       backup: 'kis',        realtime: false },
};
