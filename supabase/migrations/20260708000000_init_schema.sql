-- 1. users 테이블 (Supabase Auth와 연동 대비)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  track TEXT CHECK (track IN ('private', 'public')),
  plan TEXT CHECK (plan IN ('free', 'pro')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. markets 테이블 (진단 대상 시장)
CREATE TABLE markets (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  region TEXT CHECK (region IN ('KR', 'US'))
);

-- 3. indicators 테이블 (거시·지수 지표)
CREATE TABLE indicators (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT CHECK (category IN ('rate', 'fx', 'oil', 'index')),
  source TEXT CHECK (source IN ('ecos', 'fred', 'twelvedata', 'kis')),
  unit TEXT,
  realtime BOOLEAN DEFAULT FALSE
);

-- 4. market_data 테이블 (시계열 캐시)
CREATE TABLE market_data (
  id BIGSERIAL PRIMARY KEY,
  indicator_id INT REFERENCES indicators(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  value NUMERIC NOT NULL,
  change_abs NUMERIC,
  change_pct NUMERIC,
  as_of TIMESTAMPTZ,
  stale BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_market_data_ts ON market_data(indicator_id, ts DESC);

-- 5. market_weights 테이블 (시장별 지표 가중치)
CREATE TABLE market_weights (
  id SERIAL PRIMARY KEY,
  market_id INT REFERENCES markets(id) ON DELETE CASCADE,
  indicator_id INT REFERENCES indicators(id) ON DELETE CASCADE,
  weight NUMERIC NOT NULL CHECK (weight >= 0 AND weight <= 1),
  sign INT NOT NULL CHECK (sign IN (1, -1)),
  UNIQUE (market_id, indicator_id)
);

-- 6. correlations 테이블 (롤링 상관계수)
CREATE TABLE correlations (
  id SERIAL PRIMARY KEY,
  market_id INT REFERENCES markets(id) ON DELETE CASCADE,
  indicator_id INT REFERENCES indicators(id) ON DELETE CASCADE,
  window TEXT CHECK (window IN ('90d', '1y')),
  coef NUMERIC CHECK (coef >= -1 AND coef <= 1),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (market_id, indicator_id, window)
);

-- 7. daily_signal 테이블 (일별 진단 결과)
CREATE TABLE daily_signal (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  market_id INT REFERENCES markets(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  score NUMERIC NOT NULL,
  level TEXT CHECK (level IN ('green', 'yellow', 'red')),
  contributors JSONB,
  briefing TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, market_id, date)
);

-- 8. overnight_snapshot 테이블 (밤사이 미국 종합)
CREATE TABLE overnight_snapshot (
  id BIGSERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  us10y NUMERIC,
  wti NUMERIC,
  brent NUMERIC,
  usdkrw NUMERIC,
  usdjpy NUMERIC,
  dxy NUMERIC,
  nasdaq_close NUMERIC,
  nasdaq_fut NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- === RLS 정책 설정 ===

-- 사용자 데이터: 본인 것만 접근 가능
ALTER TABLE daily_signal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_signal" ON daily_signal
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_user" ON users
  FOR ALL USING (id = auth.uid());

-- 공용 참조 데이터: 누구나 읽기 가능, 쓰기는 서비스 롤(Edge Function)만 가능
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_markets" ON markets FOR SELECT USING (true);

ALTER TABLE indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_indicators" ON indicators FOR SELECT USING (true);

ALTER TABLE market_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_market_weights" ON market_weights FOR SELECT USING (true);

ALTER TABLE correlations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_correlations" ON correlations FOR SELECT USING (true);

ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_market_data" ON market_data FOR SELECT USING (true);

ALTER TABLE overnight_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_overnight_snapshot" ON overnight_snapshot FOR SELECT USING (true);
