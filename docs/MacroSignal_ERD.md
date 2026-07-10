# 🗂️ MacroSignal — ERD (Entity Relationship Document)

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 선행 | PRD v1.0 / TRD v1.0 |
| DB | Supabase Postgres (RLS 적용, 멀티테넌시 대비) |

---

## 1. 관계 개요

```
users ──1:N── daily_signal ──N:1── markets
                                      │
markets ──1:N── market_weights ──N:1── indicators ──1:N── market_data
                                      │
markets ──1:N── correlations ────N:1── indicators

overnight_snapshot (독립, 날짜 단위)
```

---

## 2. 테이블 명세

### 2-1. `users` (트랙2 대비, 트랙1은 1행)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | Supabase auth.users 참조 |
| email | text | |
| track | text | 'private' \| 'public' |
| plan | text | 'free' \| 'pro' (트랙2) |
| created_at | timestamptz | default now() |

### 2-2. `markets` (진단 대상 시장)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial PK | |
| code | text UNIQUE | 'kospi' \| 'kosdaq' \| 'nasdaq' |
| name | text | |
| region | text | 'KR' \| 'US' |

### 2-3. `indicators` (거시·지수 지표 정의)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial PK | |
| code | text UNIQUE | 'DGS10','KR3Y','USD/KRW','WTI'... |
| name | text | 표시명 |
| category | text | 'rate' \| 'fx' \| 'oil' \| 'index' |
| source | text | 'ecos' \| 'fred' \| 'twelvedata' \| 'kis' |
| unit | text | '%','KRW','USD/bbl','pt' |
| realtime | bool | 실시간 폴링 여부 |

### 2-4. `market_data` (시계열 캐시)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigserial PK | |
| indicator_id | int FK→indicators | |
| ts | timestamptz | 관측 시각 |
| value | numeric | |
| change_abs | numeric | 전일/전틱 대비 |
| change_pct | numeric | |
| as_of | timestamptz | 데이터 기준시각(지연 표기용) |
| stale | bool | 결측 캐리포워드 여부 |
| INDEX | | (indicator_id, ts desc) |

### 2-5. `market_weights` (3시장 × 지표 가중치 — 제품의 핵심 파라미터)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial PK | |
| market_id | int FK→markets | |
| indicator_id | int FK→indicators | |
| weight | numeric | 0~1 강도 |
| sign | int | +1 / −1 (방향) |
| UNIQUE | | (market_id, indicator_id) |

### 2-6. `correlations` (롤링 상관, 주1회 갱신)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial PK | |
| market_id | int FK→markets | |
| indicator_id | int FK→indicators | |
| window | text | '90d' \| '1y' |
| coef | numeric | -1~1 |
| updated_at | timestamptz | |

### 2-7. `daily_signal` (일별 시장별 진단 결과)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigserial PK | |
| user_id | uuid FK→users | **RLS 키** |
| market_id | int FK→markets | |
| date | date | |
| score | numeric | 종합 스코어 |
| level | text | 'green' \| 'yellow' \| 'red' |
| contributors | jsonb | [{indicator, contrib}] 투명성 |
| briefing | text | Claude 생성 문구 |
| created_at | timestamptz | |
| UNIQUE | | (user_id, market_id, date) |

### 2-8. `overnight_snapshot` (밤사이 미국 종합, 날짜당 1행)
| 컬럼 | 타입 |
|---|---|
| id | bigserial PK |
| date | date UNIQUE |
| us10y | numeric |
| wti | numeric |
| brent | numeric |
| usdkrw | numeric |
| usdjpy | numeric |
| dxy | numeric |
| nasdaq_close | numeric |
| nasdaq_fut | numeric |
| created_at | timestamptz |

---

## 3. RLS 정책 (트랙1부터 적용)

```sql
-- 사용자 데이터: 본인 것만
alter table daily_signal enable row level security;
create policy "own_signal" on daily_signal
  for all using (user_id = auth.uid());

-- 공용 참조 데이터(지표/시장/시세): 읽기 공개, 쓰기는 service_role만
alter table market_data enable row level security;
create policy "read_all" on market_data for select using (true);
-- INSERT/UPDATE는 Edge Function service_role 키로만 (정책 미부여 = 차단)
```
- `markets`, `indicators`, `market_weights`, `correlations`, `market_data`, `overnight_snapshot` → 읽기 공개, 쓰기 service_role.
- `users`, `daily_signal` → 본인 격리.

---

## 4. 시드 데이터 (초기값)

### markets
```sql
insert into markets(code,name,region) values
 ('kospi','코스피','KR'),('kosdaq','코스닥','KR'),('nasdaq','나스닥','US');
```

### indicators (핵심)
```sql
insert into indicators(code,name,category,source,unit,realtime) values
 ('DGS10','미국 10년 국채금리','rate','fred','%',false),
 ('KR3Y','한국 국고채 3년','rate','ecos','%',false),
 ('BASE_KR','한국 기준금리','rate','ecos','%',false),
 ('FEDFUNDS','미국 연방기금금리','rate','fred','%',false),
 ('USD/KRW','원달러 환율','fx','twelvedata','KRW',true),
 ('USD/JPY','달러엔 환율','fx','twelvedata','JPY',true),
 ('DXY','달러인덱스','fx','twelvedata','pt',true),
 ('WTI','WTI 유가','oil','twelvedata','USD/bbl',true),
 ('XBR','브렌트 유가','oil','twelvedata','USD/bbl',true),
 ('NASDAQCOM','나스닥 종합','index','fred','pt',false);
```

### market_weights (초기값 — 3번 매트릭스 기반, 백테스트로 튜닝 예정)
> sign: +1=우호, −1=악재 / weight: 상대 강도 (합이 1일 필요는 없음, 정규화는 엔진에서)

| market | indicator | weight | sign |
|---|---|---|---|
| kospi | USD/KRW | 0.9 | −1 |
| kospi | DGS10 | 0.5 | −1 |
| kospi | NASDAQCOM | 0.7 | +1 |
| kospi | WTI | 0.3 | −1 |
| kospi | DXY | 0.6 | −1 |
| kosdaq | DGS10 | 0.9 | −1 |
| kosdaq | NASDAQCOM | 0.9 | +1 |
| kosdaq | USD/KRW | 0.5 | −1 |
| kosdaq | DXY | 0.5 | −1 |
| nasdaq | DGS10 | 1.0 | −1 |
| nasdaq | DXY | 0.7 | −1 |
| nasdaq | WTI | 0.2 | −1 |

```sql
-- 예시 (kosdaq × DGS10)
insert into market_weights(market_id,indicator_id,weight,sign)
select m.id, i.id, 0.9, -1 from markets m, indicators i
where m.code='kosdaq' and i.code='DGS10';
-- 나머지도 동일 패턴으로 삽입
```

---

## 5. 마이그레이션 순서
1. `markets`, `indicators` (참조)
2. `market_data`, `market_weights`, `correlations` (FK)
3. `users`, `daily_signal`, `overnight_snapshot`
4. RLS 정책 활성화
5. 시드 데이터 삽입

→ 다음: **GUIDE**(개발환경·폴더구조·실행·배포·확장 방법).
