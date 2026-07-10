# 🛠️ MacroSignal — GUIDE (개발 가이드)

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 선행 | PRD / TRD / ERD |
| 대상 | 이 프로젝트를 세팅·개발·배포하는 개발자(본인 + 협업자) |

---

## 1. 사전 준비: API 키 발급 (제일 먼저)

| 서비스 | 발급처 | 비고 |
|---|---|---|
| 한국은행 ECOS | ecos.bok.or.kr → OpenAPI → 인증키 신청 | 무료, 1일 내 활성 |
| FRED | fred.stlouisfed.org → My Account → API Keys | 무료 즉시 |
| Twelve Data | twelvedata.com → 가입 → API Key | 무료 800콜/일 |
| KIS OpenAPI | 한국투자증권 개발자센터 (또는 키움 REST) | 기존 자산 재사용 |
| Anthropic | console.anthropic.com | Claude 브리핑용 |
| Supabase | supabase.com → New Project | Postgres+Edge+Cron |

---

## 2. 폴더 구조 (Next.js 14 App Router)

```
macrosignal/
├─ app/
│  ├─ page.tsx                 # 대시보드 (Server Component)
│  ├─ layout.tsx
│  └─ (dashboard)/
│     ├─ MarketTabs.tsx        # 코스피/코스닥/나스닥 탭
│     ├─ SignalHero.tsx        # 3시장 신호 요약
│     ├─ MacroCards.tsx        # 금리/환율/유가 카드
│     ├─ CorrelationHeatmap.tsx
│     └─ OvernightPanel.tsx
├─ lib/
│  ├─ adapters/                # DataSourceAdapter 구현
│  │  ├─ ecos.ts  fred.ts  twelvedata.ts  kis.ts
│  │  └─ registry.ts           # SOURCE_MAP
│  ├─ engine/
│  │  ├─ signal.ts             # 3시장 스코어 계산
│  │  └─ normalize.ts          # Z-score
│  ├─ supabase/
│  │  ├─ client.ts  server.ts
│  └─ track.ts                 # TRACK 피처 플래그
├─ supabase/
│  ├─ migrations/              # ERD SQL
│  └─ functions/               # Edge Functions
│     ├─ cron-daily/
│     ├─ cron-intraday/
│     ├─ cron-correl/
│     ├─ fn-signal/
│     └─ fn-briefing/
├─ components/ui/              # shadcn/ui
├─ .env.local
└─ ...
```

---

## 3. 환경변수 (.env.local / Supabase Secrets)

```bash
# 프런트 (public 접두사 없는 것은 서버 전용)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Edge Function Secrets (supabase secrets set)
ECOS_KEY=...
FRED_KEY=...
TWELVEDATA_KEY=...
KIS_APP_KEY=...   KIS_APP_SECRET=...
ANTHROPIC_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # 쓰기용

# 트랙 분기
TRACK=private   # private | public
```
> ⚠️ 외부 API 키는 절대 `NEXT_PUBLIC_` 접두사 금지. 프런트 번들에 노출됨.

---

## 4. 초기 세팅 순서

```bash
# 1) 프로젝트 생성
npx create-next-app@latest macrosignal --typescript --tailwind --app
cd macrosignal
npx shadcn@latest init

# 2) 의존성
npm i @supabase/supabase-js recharts

# 3) Supabase 연결 & 마이그레이션
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push          # ERD migrations 적용

# 4) 시드 데이터 삽입 (ERD 4번)
npx supabase db execute -f supabase/seed.sql

# 5) Edge Function 배포
npx supabase functions deploy cron-daily
npx supabase functions deploy cron-intraday
# ... 나머지

# 6) Cron 등록 (pg_cron 또는 Supabase 스케줄)
#   cron-daily    : 매일 07:30 KST
#   cron-intraday : 장중 5분 (08:00~16:00 KST)
#   cron-correl   : 매주 일요일

# 7) 로컬 실행
npm run dev
```

---

## 5. 확장 방법 (자주 하는 작업)

### 새 지표 추가 (예: 금 XAU)
1. `indicators`에 row 추가 (code, source, realtime)
2. `SOURCE_MAP`에 primary/backup 매핑
3. 필요 시 어댑터에 심볼 지원 확인
4. `market_weights`에 각 시장별 weight/sign 추가
→ **코드 배포 없이 대부분 DB로 처리됨** (엔진이 자동 반영)

### 새 시장 추가 (예: S&P500)
1. `markets`에 code 추가
2. `market_weights`에 해당 시장의 지표별 가중치 세트 추가
3. UI 탭에 자동 노출(마켓 목록 기반 렌더링)

### 가중치 튜닝
- `market_weights.weight/sign` 수정 → 즉시 반영 (배포 불필요)
- 백테스트 결과로 주기적 조정

---

## 6. 트랙 분기 사용법

```typescript
// lib/track.ts
export const TRACK = process.env.TRACK ?? 'private';
export const isPublic = () => TRACK === 'public';

// 표현 순화 예
const tone = isPublic() ? 'informational' : 'direct';
// 인증 게이트
if (isPublic()) requireAuth();
```

---

## 7. 배포

| 대상 | 방법 |
|---|---|
| 프런트 | GitHub push → Vercel 자동배포. `TRACK` 환경변수 Vercel에 설정 |
| DB/함수 | `supabase db push`, `supabase functions deploy` |
| 트랙2 스테이징 | Vercel Preview 브랜치 + 별도 Supabase 프로젝트 권장 |

---

## 8. 로컬 디버깅 팁
- Edge Function 로컬: `supabase functions serve fn-signal`
- rate limit 확인: Twelve Data 응답 헤더 `api-credits-left`
- 결측/지연 재현: `market_data.stale=true` 케이스 UI 배지 확인
- Claude 브리핑 장애 시: 규칙엔진 결과만으로 화면 정상 동작하는지 검증(핵심)

---

## 9. 코딩 컨벤션
- 다크 · 모바일 퍼스트. shadcn/ui 기본 컴포넌트 우선.
- 서버에서 데이터 조립(Server Component), 스파크라인 등만 Client.
- 판단 로직(engine)은 순수함수 + 단위테스트 대상.
- 커밋: `feat/fix/chore(scope): ...`

→ 다음: **TASK**(한 번에 하나씩 실행 목록), **PROMPT**(AI·빌드 프롬프트), **PLAN**(마스터 일정).
