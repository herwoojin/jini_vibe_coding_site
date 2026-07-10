# 💬 MacroSignal — PROMPT (프롬프트 설계)

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 선행 | PRD / TRD / ERD / GUIDE / TASK |
| 구성 | ① 앱 내부 Claude API 브리핑 프롬프트 ② Claude Code 빌드 프롬프트(태스크별) |

---

## PART A. 앱 내부 브리핑 프롬프트 (fn-briefing)

> 원칙: **판단은 규칙엔진이 이미 끝냈다.** Claude는 계산 결과를 "사람 말"로 번역만 한다. 새로운 투자판단을 창작하지 않는다.

### A-1. System Prompt
```
당신은 거시경제 지표를 개인 투자자가 이해하기 쉽게 요약하는 애널리스트입니다.
규칙:
1. 제공된 수치와 계산된 신호(score/level/contributors)만 근거로 삼습니다.
   새로운 예측이나 수치를 지어내지 마세요.
2. 각 시장(코스피/코스닥/나스닥)당 3~4문장으로 작성합니다.
3. "무엇이(지표) 어느 방향으로(±) 이 시장에 영향을 주는지"를 설명합니다.
4. 반드시 마지막에 "본 내용은 투자 참고 정보이며 투자 권유가 아닙니다"를 포함합니다.
5. 특정 종목 매수/매도를 지시하지 않습니다. 시장·환경 수준에서만 기술합니다.
6. 톤: {TONE}   // private=직접적이고 실용적 / public=중립적 정보제공형
```

### A-2. User Prompt 템플릿
```
[날짜] {date}

[밤사이 미국 종합]
- 美 10년물: {us10y}% (전일 {d_us10y}bp)
- 나스닥 종가: {nasdaq_close} ({d_nasdaq}%), 선물: {nasdaq_fut}
- WTI: {wti} ({d_wti}%) / DXY: {dxy}
- USD/KRW: {usdkrw} ({d_usdkrw}) / USD/JPY: {usdjpy}

[규칙엔진 계산 결과]
- 코스피: score={s_kospi}, level={l_kospi}, 주요기여={contrib_kospi}
- 코스닥: score={s_kosdaq}, level={l_kosdaq}, 주요기여={contrib_kosdaq}
- 나스닥: score={s_nasdaq}, level={l_nasdaq}, 주요기여={contrib_nasdaq}

위 결과를 바탕으로 시장별 브리핑을 작성하세요.
JSON으로만 응답: {"kospi":"...","kosdaq":"...","nasdaq":"...","disclaimer":"..."}
전문(preamble)이나 마크다운 없이 JSON만.
```

### A-3. 파싱·안전장치
- 응답을 JSON 파싱, 실패 시 재시도 1회 → 그래도 실패면 **브리핑 생략**하고 규칙엔진 결과만 표시(핵심 동작 보장).
- `disclaimer` 필드 누락 시 서버에서 강제 삽입.
- 모델: 최신 Claude(예: `claude-sonnet-4-6`), `max_tokens` 적정값.

### A-4. 좋은 출력 예 (참고)
```
코스닥: 밤사이 미국 10년물 금리가 12bp 급등하며 성장주 전반에 부담을 주는 환경입니다.
코스닥은 성장주 비중이 높아 금리 상승에 특히 민감하게 반응하는 경향이 있습니다.
나스닥 선물도 약세를 보여 위험선호가 위축된 상태입니다. 방어적 관점에서 접근할
만한 환경으로 해석됩니다. 본 내용은 투자 참고 정보이며 투자 권유가 아닙니다.
```

---

## PART B. Claude Code 빌드 프롬프트 (태스크별)

> 사용법: Antigravity IDE + Claude Code에서 각 태스크 착수 시 해당 프롬프트 사용. **한 번에 하나씩.** 항상 "PRD/TRD/ERD 준수, 표준 스택, 다크 모바일퍼스트" 컨텍스트 유지.

### 공통 컨텍스트 (매 프롬프트 앞에 붙이기)
```
프로젝트: MacroSignal (거시지표 기반 3시장 어드바이저)
스택: Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + Supabase + Claude API
원칙: 다크/모바일퍼스트. 외부 API 키는 서버(Edge Function)에만. 판단로직은 순수함수.
문서: PRD/TRD/ERD/GUIDE 준수. 한 번에 하나의 태스크만.
```

### B-T0-1. 부트스트랩
```
create-next-app(TS, Tailwind, App Router) 기반으로 MacroSignal 프로젝트 뼈대를 만들어줘.
shadcn/ui 초기화, Supabase 클라이언트(lib/supabase/client.ts, server.ts) 설정,
다크 모바일퍼스트 레이아웃(app/layout.tsx)과 빈 대시보드(app/page.tsx)까지.
```

### B-T0-3. 스키마 + 시드
```
첨부한 ERD를 기반으로 supabase/migrations SQL을 생성해줘.
테이블: users, markets, indicators, market_data, market_weights, correlations,
daily_signal, overnight_snapshot. RLS 정책 포함(사용자데이터 본인격리, 참조데이터 읽기공개).
그리고 ERD 4번 시드데이터(markets 3개, indicators 10개, market_weights 매트릭스)를
seed.sql로 만들어줘.
```

### B-T1-1. 어댑터
```
DataSourceAdapter 인터페이스(TRD 2번)를 정의하고 ecos/fred/twelvedata/kis 4개 어댑터를
lib/adapters/에 구현해줘. 각 어댑터는 fetchLatest, fetchSeries, healthCheck를 구현.
registry.ts에 SOURCE_MAP(심볼→primary/backup/realtime)을 정의.
API 명세는 TRD 3번 참고. 키는 환경변수에서 읽고 절대 하드코딩하지 마.
각 어댑터 단위테스트도 함께.
```

### B-T1-2/3. 크론 수집
```
Supabase Edge Function 'cron-daily'를 만들어줘: ECOS/FRED에서 금리·유가·환율 일별값과
overnight_snapshot을 수집해 market_data에 upsert. 그리고 'cron-intraday'는
USD/KRW,USD/JPY,WTI,XBR,DXY를 Twelve Data 배치 1콜(콤마구분)로 5분마다 upsert.
rate limit 예산(일 ~120콜) 준수. as_of 시각 기록.
```

### B-T1-5. 폴백
```
어댑터 호출에 폴백 로직을 추가해줘: primary가 429/5xx면 지수백오프 3회 재시도 후
backup 어댑터로 전환, 둘 다 실패하면 직전 캐시값 유지하고 stale=true 표시.
모든 값에 as_of를 남겨 UI가 지연배지를 띄울 수 있게.
```

### B-T2-1. 신호 엔진
```
lib/engine/에 신호 계산 엔진을 순수함수로 구현해줘(TRD 5번).
normalize.ts: 전일대비 변동의 Z-score. signal.ts: market_weights를 읽어
시장별 contrib=z×weight×sign, score=Σcontrib, level 판정(임계값 T).
출력에 contributors 배열 포함(투명성). 결정적 단위테스트 포함.
```

### B-T2-3. fn-signal
```
Edge Function 'fn-signal'을 만들어줘: 최신 market_data + correlations를 읽어
엔진으로 3시장(kospi/kosdaq/nasdaq) 진단을 계산하고 daily_signal에 upsert.
(user_id, market_id, date) 유니크. contributors JSON 저장.
```

### B-T3-1. 브리핑
```
Edge Function 'fn-briefing'을 만들어줘: daily_signal의 score/contributors와 주요 수치를
PART A 프롬프트로 Claude API에 보내 시장별 브리핑(JSON)을 생성, daily_signal.briefing에 저장.
JSON 파싱 실패 시 재시도1회→실패면 브리핑 생략(규칙결과만으로 동작). disclaimer 강제.
TRACK에 따라 톤 파라미터 분기.
```

### B-T4-*. UI
```
대시보드 UI를 만들어줘(다크/모바일퍼스트, shadcn/ui, Recharts):
- SignalHero: 코스피/코스닥/나스닥 신호(🟢🟡🔴)+한줄요약
- MarketTabs: 탭 전환 시 해당 시장 브리핑+기여지표 바
- MacroCards: 금리/환율/유가 값+전일대비+장중 스파크라인, Supabase Realtime 자동갱신
- CorrelationHeatmap, OvernightPanel, 하단 고정 투자유의 고지
데이터는 Server Component에서 Supabase로 조립, 스파크라인만 Client.
```

---

## PART C. 프롬프트 운영 원칙
- 빌드 프롬프트는 **태스크 1개 = 프롬프트 1개**. 여러 태스크 몰아서 요청 금지(님의 one-task 패턴).
- 앱 내부 브리핑 프롬프트는 **판단 창작 금지·고지 강제**가 절대 규칙.
- 트랙2 공개 시 브리핑 톤을 `informational`로 바꾸고, 지시형 표현 필터를 추가.

→ 다음: **PLAN**(마스터 일정·마일스톤·의존성 총괄).
