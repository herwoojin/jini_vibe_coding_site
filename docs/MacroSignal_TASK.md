# ✅ MacroSignal — TASK (실행 태스크 목록)

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 선행 | PRD / TRD / ERD / GUIDE |
| 원칙 | **한 번에 하나씩(one-task-at-a-time)**. 각 태스크는 독립적으로 완료·검증 가능. 수용 기준(AC) 충족 시 다음으로 |

범례: `[ ]` 대기 · `[~]` 진행 · `[x]` 완료

---

## Phase 0 — 기반 세팅

### T0-1. 프로젝트 부트스트랩
- 내용: create-next-app + Tailwind + shadcn/ui + Supabase 연결
- AC: `npm run dev` 로 빈 대시보드 렌더, Supabase 클라이언트 연결 성공
- 의존: 없음

### T0-2. API 키 6종 발급 + 연결 스모크 테스트
- 내용: ECOS·FRED·Twelve Data·KIS·Anthropic·Supabase 키 발급, 각 1콜 성공 확인
- AC: 각 소스에서 임의 1개 값 콘솔 출력 성공 (예: USD/KRW 최신값, DGS10 최신값)
- 의존: 없음

### T0-3. DB 스키마 + 시드 적용
- 내용: ERD의 migrations 실행 + markets/indicators/market_weights 시드
- AC: `select * from market_weights` 12행 이상, 3개 markets 존재
- 의존: T0-1

---

## Phase 1 — 데이터 수집 파이프라인

### T1-1. DataSourceAdapter 인터페이스 + 어댑터 4종
- 내용: `ecos/fred/twelvedata/kis` 어댑터 구현 + `registry(SOURCE_MAP)`
- AC: 각 어댑터 `fetchLatest`, `fetchSeries`, `healthCheck` 통과(단위테스트)
- 의존: T0-2

### T1-2. cron-daily (일별 배치)
- 내용: 금리(ECOS/FRED)·유가·환율 일별값 + overnight_snapshot upsert
- AC: 실행 후 `market_data`에 당일 일별값 적재, `overnight_snapshot` 1행 생성
- 의존: T1-1

### T1-3. cron-intraday (장중 5분 폴링)
- 내용: USD/KRW·USD/JPY·WTI·XBR·DXY 배치 1콜 폴링 → upsert
- AC: 5분 간격 최신값 갱신, Twelve Data 일 호출 예산(~120) 내
- 의존: T1-1

### T1-4. 국내 지수·수급 (KIS/키움)
- 내용: 코스피·코스닥 지수 + 외국인 순매수 수집
- AC: 장중 지수·수급값이 `market_data`에 실시간~1분 갱신
- 의존: T1-1

### T1-5. 에러/폴백 + 캐시 무결성
- 내용: 429/5xx 백오프→backup, 결측 캐리포워드(stale), as-of 기록
- AC: primary 강제 실패 주입 시 backup 전환·UI 지연배지 노출
- 의존: T1-2, T1-3

---

## Phase 2 — 신호 엔진 (핵심)

### T2-1. 정규화 + 스코어 순수함수
- 내용: Z-score → 시장별 contrib → score → level (TRD 5)
- AC: 고정 입력에 대해 3시장 score/level/contributors 결정적 출력(단위테스트)
- 의존: T0-3

### T2-2. 롤링 상관 배치 (cron-correl)
- 내용: 과거 데이터 적재 후 90d/1y 상관 계산 → `correlations`
- AC: 주1회 실행, 각 시장×지표 coef 갱신
- 의존: T1-2

### T2-3. fn-signal (일별 3시장 진단 생성)
- 내용: 최신값+상관 → daily_signal upsert (시장별)
- AC: 매일 코스피/코스닥/나스닥 각 1행, contributors JSON 포함
- 의존: T2-1, T2-2

---

## Phase 3 — AI 브리핑

### T3-1. 브리핑 프롬프트 + fn-briefing
- 내용: score·contributors → Claude 시장별 3~4문장 (PROMPT 문서 준수)
- AC: 3시장 브리핑 생성, "투자권유 아님" 고지 포함, 장애 시 규칙결과만으로도 정상
- 의존: T2-3

---

## Phase 4 — 대시보드 UI

### T4-1. SignalHero (3시장 요약)
- AC: 코스피/코스닥/나스닥 신호(🟢🟡🔴) + 한줄요약 노출
- 의존: T2-3

### T4-2. MarketTabs + 상세(기여지표 바)
- AC: 탭 전환 시 해당 시장 브리핑 + contributors 시각화
- 의존: T3-1

### T4-3. MacroCards (금리/환율/유가 + 스파크라인)
- AC: 실시간 값 + 전일대비 + 장중 스파크라인, Realtime 자동갱신
- 의존: T1-3

### T4-4. CorrelationHeatmap
- AC: 거시×시장 상관 히트맵 렌더
- 의존: T2-2

### T4-5. OvernightPanel + 고지문
- AC: 밤사이 미국 종합 패널 + 하단 고정 투자유의 고지
- 의존: T1-2

---

## Phase 5 — 트랙1 검증 & 튜닝

### T5-1. 본인 실사용 2~4주
- AC: 매일 아침 접속 습관화, 진단이 실제 장과 체감 부합 기록
- 의존: T4-*

### T5-2. 가중치 백테스트 튜닝
- 내용: market_weights 조정, 임계값 T 캘리브레이션
- AC: 과거 구간 재현 시 오탐 감소
- 의존: T5-1

---

## Phase 6 — 트랙2 전환 (공개용, 트랙1 검증 후)

### T6-1. 데이터 라이선스 재계약
- AC: Twelve Data 재배포/유료 확정, 소스 약관 검토 완료
### T6-2. 법적 검토 + 문구 순화
- AC: 유사투자자문 리스크 검토, 표현 레이어 public 톤 적용
### T6-3. 인증·요금제·멀티테넌시 활성화
- AC: 소셜로그인, RLS 다중 사용자 격리, 사용량 제한
### T6-4. 모니터링·비용 최적화
- AC: 공유 캐시(중앙 1회 수집→전사용자) 확인, 호출량·비용 대시보드

---

## 실행 순서 요약
```
T0-1 → T0-2 → T0-3
→ T1-1 → (T1-2, T1-3, T1-4 병렬) → T1-5
→ T2-1 → T2-2 → T2-3
→ T3-1
→ T4-1 → T4-2 → T4-3 → T4-4 → T4-5
→ T5-1 → T5-2
→ (검증 후) T6-*
```
→ 각 태스크 착수 시 **PROMPT 문서의 해당 빌드 프롬프트** 사용.
