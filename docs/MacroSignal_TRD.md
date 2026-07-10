# ⚙️ MacroSignal — TRD (Technical Requirements Document)

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 선행 | PRD v1.0 |
| 스택 | Next.js 14(App Router) + TS + Tailwind + shadcn/ui / Supabase(Postgres·Edge Functions·Realtime·Cron) / Anthropic Claude API / Vercel |
| 목적 | PRD의 기능요구를 "어떻게 구현할지"로 번역. API 명세·데이터 흐름·에러/폴백·보안 확정 |

---

## 1. 시스템 아키텍처

```
┌────────────────────────────────────────────────────────────┐
│                     Next.js 14 (Vercel)                     │
│  ─ 대시보드 UI (Server Components + Client 스파크라인)         │
│  ─ Supabase 클라이언트(RLS) / Realtime 구독                   │
└───────────────▲──────────────────────────▲─────────────────┘
                │ (읽기: 캐시된 데이터)         │ (Realtime push)
┌───────────────┴──────────────────────────┴─────────────────┐
│                        Supabase                             │
│  Postgres(캐시·신호) ── RLS ── Realtime                       │
│  Edge Functions:                                            │
│   • cron-daily     (금리·유가·환율 일별, overnight 스냅샷)      │
│   • cron-intraday  (환율·유가·미선물 5분 폴링)                 │
│   • cron-correl    (롤링 상관 재계산: 주1회)                   │
│   • fn-signal      (3시장 스코어 계산)                        │
│   • fn-briefing    (Claude 브리핑 생성)                       │
└───────────────▲──────────────────────────▲─────────────────┘
                │ DataSourceAdapter          │
   ┌────────────┴───────┬──────────┬─────────┴────────┐
   │ ECOS(한)  FRED(미)  │ TwelveData│ KIS/키움(국내지수)│
   └────────────────────┴──────────┴──────────────────┘
```

**설계 원칙**
- 외부 API 호출은 **전부 Edge Function 서버측**에서만. 프런트는 Supabase 캐시만 읽음 → API 키 무노출 + rate limit 제어.
- 모든 외부 소스는 `DataSourceAdapter` 공통 인터페이스 뒤에 둠 → 트랙2 유료 전환 시 어댑터만 교체.

---

## 2. DataSourceAdapter 인터페이스 (핵심 추상화)

```typescript
// 모든 외부 소스가 구현하는 공통 계약
interface DataSourceAdapter {
  id: string;                    // 'ecos' | 'fred' | 'twelvedata' | 'kis'
  fetchLatest(symbol: string): Promise<Quote>;         // 최신값
  fetchSeries(symbol: string, opts: SeriesOpts): Promise<Bar[]>; // 시계열
  healthCheck(): Promise<boolean>;
}

interface Quote { symbol: string; value: number; asOf: string; changePct?: number; }
interface Bar   { ts: string; open?: number; high?: number; low?: number; close: number; }
interface SeriesOpts { interval: '1min'|'5min'|'1day'; outputsize?: number; from?: string; }
```

레지스트리에서 지표별 primary/backup 어댑터를 매핑:
```typescript
const SOURCE_MAP = {
  'USD/KRW':  { primary: 'twelvedata', backup: 'exim',  realtime: true  },
  'USD/JPY':  { primary: 'twelvedata', backup: 'fred',  realtime: true  },
  'WTI':      { primary: 'twelvedata', backup: 'eia',   realtime: true  },
  'DGS10':    { primary: 'fred',       backup: null,    realtime: false }, // 美10년
  'KR3Y':     { primary: 'ecos',       backup: null,    realtime: false },
  'NASDAQ':   { primary: 'fred',       backup: 'twelvedata', realtime: false },
  'KOSPI':    { primary: 'kis',        backup: null,    realtime: true  },
  'KOSDAQ':   { primary: 'kis',        backup: null,    realtime: true  },
};
```

---

## 3. 외부 API 명세

### 3-1. 한국은행 ECOS (韓 금리·환율, 일별)
- Base: `https://ecos.bok.or.kr/api/StatisticSearch/{KEY}/json/kr/1/100/{STAT}/{CYCLE}/{START}/{END}/{ITEM}`
- 인증: 무료 인증키(헤더 아님, URL 경로)
- 주요 통계표: 시장금리(일) `817Y002`, 기준금리 `722Y001`, 환율 통계표(코드 ECOS 검색으로 확정)
- 응답: JSON `StatisticSearch.row[]` → `DATA_VALUE`, `TIME`
- 오류 코드: `INFO-200`(데이터 없음), `INFO-100`(인증키 오류) → 로그 후 스킵/알림

### 3-2. FRED (美 금리·유가·나스닥, 일별)
- Base: `https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json&sort_order=desc&limit=5`
- 주요 series_id: `DGS10`, `FEDFUNDS`/`DFF`, `DCOILWTICO`, `DCOILBRENTEU`, `NASDAQCOM`, `DEXKOUS`, `DEXJPUS`
- 응답: `observations[]` → `date`, `value`("."는 결측 → 직전 유효값 사용)
- 주의: 하루 지연 가능 → `asOf`에 관측일 기록

### 3-3. Twelve Data (실시간 환율·유가·미선물)
- 최신값: `https://api.twelvedata.com/quote?symbol=USD/KRW&apikey={KEY}`
- 시계열: `https://api.twelvedata.com/time_series?symbol=WTI&interval=5min&outputsize=30&apikey={KEY}`
- 무료 한도: **8req/min, ~800/day** → 폴링 심볼 수 × 주기 예산 관리 (아래 4참조)
- 배치 호출: `symbol=USD/KRW,USD/JPY,WTI,XBR` 콤마 구분으로 1콜에 다심볼
- 오류: `code:429`(한도초과) → 백오프 + 백업 소스

### 3-4. KIS OpenAPI / 키움 REST (국내 지수·수급)
- 국내 최우선. 지수(코스피/코스닥), 외국인·기관 순매수.
- 토큰 발급(OAuth) → 지수 시세/수급 엔드포인트 폴링. (기존 자산 재사용, 상세는 GUIDE)
- 오류/토큰만료: 자동 재발급 로직.

---

## 4. Rate Limit 예산 (Twelve Data 무료 800/day 기준)

| 심볼셋 | 주기 | 장중 시간 | 일 호출수 |
|---|---|---|---|
| USD/KRW,USD/JPY,WTI,XBR,DXY (배치 1콜) | 5분 | 08:00~16:00(8h) | 8h×12 = **96콜** |
| 나스닥 선물(야간 배치 1콜) | 10분 | 06:00~08:00 등 | ~12콜 |
| 일별 배치 | 1회/일 | — | ~10콜 |
| **합계** | | | **~120콜/일** ✅ 여유 |

→ 무료 티어로 트랙1 충분. 트랙2 다중 사용자는 **사용자별 호출이 아니라 "중앙 1회 수집 → 전 사용자 공유"** 구조라 호출량 불변(공유 캐시). 단 재배포 라이선스는 별도.

---

## 5. 신호 계산 엔진 (fn-signal)

```
입력: 각 지표 최신값 + 전일값 + 롤링 상관계수(correlations)
1) 정규화:  z = (Δ - μ_Δ) / σ_Δ      (전일대비 변동의 Z-score)
2) 시장별 기여:  contrib(m,i) = z_i × weight(m,i) × sign(m,i)
3) 시장 스코어:  score(m) = Σ_i contrib(m,i)
4) 레벨:  score ≥ +T → 🟢 / |score| < T → 🟡 / score ≤ −T → 🔴
5) 출력:  {market, score, level, contributors[] }  ← contributors로 투명성 확보
```
- `weight`, `sign`은 `market_weights` 테이블(데이터 관리, 하드코딩 금지)
- 임계값 `T`는 환경설정. 초기 백테스트로 캘리브레이션.

---

## 6. AI 브리핑 (fn-briefing)
- Claude API(`claude-sonnet-4-6` 등 최신) 호출, 시장별 3~4문장.
- 입력: 계산된 score·contributors·주요 지표 수치. **원시 숫자만 전달, 판단은 규칙엔진이 이미 한 것을 문장화**.
- `TRACK`에 따라 톤 파라미터 분기(private=직접적 / public=정보제공형).
- 상세 프롬프트는 PROMPT 문서.

---

## 7. 에러 처리 & 폴백 규칙

| 상황 | 처리 |
|---|---|
| primary 소스 429/5xx | 지수백오프 재시도(최대 3) → 실패 시 backup 어댑터 |
| backup도 실패 | **직전 캐시값 유지** + UI에 "⚠️ 지연됨(as-of 시각)" 배지 |
| 결측치(".") | 직전 유효값 캐리포워드, `stale=true` 플래그 |
| 상관계수 미계산 | 기본 부호값(문헌 기반) 사용, 로그 경고 |
| Claude 브리핑 실패 | 규칙엔진 결과만 표시(브리핑 없이도 동작) — **AI는 부가, 핵심 아님** |

---

## 8. 보안 (NFR)
- 모든 외부 API 키: Supabase Edge Function **환경변수**에만. 프런트 번들 금지.
- Supabase **RLS 전 테이블 적용**(트랙1부터). `daily_signal` 등 사용자 데이터 `user_id = auth.uid()`.
- HTTPS 강제, CORS 화이트리스트.
- 트랙2: 소셜로그인(Supabase Auth), 개인정보 최소 수집.

---

## 9. 배포 & 환경
- 프런트: Vercel (Preview=트랙2 스테이징 / Prod).
- 백엔드: Supabase (Edge Functions + pg_cron).
- 환경변수: `ECOS_KEY`, `FRED_KEY`, `TWELVEDATA_KEY`, `KIS_APP_KEY/SECRET`, `ANTHROPIC_API_KEY`, `TRACK`.
- CI: GitHub → Vercel 자동배포. Edge Function은 supabase CLI 배포.

---

## 10. 기술 결정 로그 (ADR 요약)
1. **왜 Supabase를 프록시로?** → API 키 은닉 + rate limit 중앙제어 + Realtime 무료.
2. **왜 실시간 스트리밍 대신 5분 폴링?** → 무료 티어 WebSocket 미지원, 5분이면 거시 판단에 충분.
3. **왜 규칙엔진 + AI 분리?** → 판단 로직은 투명·재현가능해야. AI는 문장화 부가 레이어(장애 시에도 핵심 동작).
4. **왜 market_weights를 DB에?** → 코드 배포 없이 튜닝·백테스트 반영.

→ 다음: **ERD**(테이블·컬럼·RLS·시드데이터 확정).
