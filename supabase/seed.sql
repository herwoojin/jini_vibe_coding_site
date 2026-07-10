-- === markets 시드 ===
INSERT INTO markets (code, name, region) VALUES
  ('kospi', '코스피', 'KR'),
  ('kosdaq', '코스닥', 'KR'),
  ('nasdaq', '나스닥', 'US')
ON CONFLICT (code) DO NOTHING;

-- === indicators 시드 ===
INSERT INTO indicators (code, name, category, source, unit, realtime) VALUES
  ('DGS10', '미국 10년 국채금리', 'rate', 'fred', '%', false),
  ('KR3Y', '한국 국고채 3년', 'rate', 'ecos', '%', false),
  ('BASE_KR', '한국 기준금리', 'rate', 'ecos', '%', false),
  ('FEDFUNDS', '미국 연방기금금리', 'rate', 'fred', '%', false),
  ('USD/KRW', '원달러 환율', 'fx', 'twelvedata', 'KRW', true),
  ('USD/JPY', '달러엔 환율', 'fx', 'twelvedata', 'JPY', true),
  ('DXY', '달러인덱스', 'fx', 'twelvedata', 'pt', true),
  ('WTI', 'WTI 유가', 'oil', 'twelvedata', 'USD/bbl', true),
  ('XBR', '브렌트 유가', 'oil', 'twelvedata', 'USD/bbl', true),
  ('NASDAQCOM', '나스닥 종합', 'index', 'fred', 'pt', false)
ON CONFLICT (code) DO NOTHING;

-- === market_weights 시드 (코스피) ===
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.9, -1 FROM markets m, indicators i WHERE m.code = 'kospi' AND i.code = 'USD/KRW'
ON CONFLICT DO NOTHING;
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.5, -1 FROM markets m, indicators i WHERE m.code = 'kospi' AND i.code = 'DGS10'
ON CONFLICT DO NOTHING;
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.7, 1 FROM markets m, indicators i WHERE m.code = 'kospi' AND i.code = 'NASDAQCOM'
ON CONFLICT DO NOTHING;
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.3, -1 FROM markets m, indicators i WHERE m.code = 'kospi' AND i.code = 'WTI'
ON CONFLICT DO NOTHING;
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.6, -1 FROM markets m, indicators i WHERE m.code = 'kospi' AND i.code = 'DXY'
ON CONFLICT DO NOTHING;

-- === market_weights 시드 (코스닥) ===
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.9, -1 FROM markets m, indicators i WHERE m.code = 'kosdaq' AND i.code = 'DGS10'
ON CONFLICT DO NOTHING;
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.9, 1 FROM markets m, indicators i WHERE m.code = 'kosdaq' AND i.code = 'NASDAQCOM'
ON CONFLICT DO NOTHING;
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.5, -1 FROM markets m, indicators i WHERE m.code = 'kosdaq' AND i.code = 'USD/KRW'
ON CONFLICT DO NOTHING;
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.5, -1 FROM markets m, indicators i WHERE m.code = 'kosdaq' AND i.code = 'DXY'
ON CONFLICT DO NOTHING;

-- === market_weights 시드 (나스닥) ===
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 1.0, -1 FROM markets m, indicators i WHERE m.code = 'nasdaq' AND i.code = 'DGS10'
ON CONFLICT DO NOTHING;
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.7, -1 FROM markets m, indicators i WHERE m.code = 'nasdaq' AND i.code = 'DXY'
ON CONFLICT DO NOTHING;
INSERT INTO market_weights (market_id, indicator_id, weight, sign)
SELECT m.id, i.id, 0.2, -1 FROM markets m, indicators i WHERE m.code = 'nasdaq' AND i.code = 'WTI'
ON CONFLICT DO NOTHING;
