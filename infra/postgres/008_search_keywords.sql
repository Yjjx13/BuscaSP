CREATE TABLE search_keywords (
  id BIGSERIAL PRIMARY KEY,
  keyword VARCHAR(100) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO search_keywords (keyword, sort_order) VALUES
  ('厕所清洁剂', 100), ('厕所垃圾桶', 99), ('厕所刷', 98), ('厕所收纳架', 97),
  ('标签打印机', 90), ('热敏打印机', 89), ('便携打印机', 88), ('打印机墨水', 87),
  ('玻璃水杯', 80), ('玻璃碗套装', 79), ('餐具套装', 78),
  ('迷你电煮锅', 70), ('电饭锅', 69), ('厨房小家电', 68),
  ('3D打印耗材', 60), ('PLA打印线材', 59),
  ('香水礼盒', 50), ('解压玩具', 49), ('捏捏乐', 48)
ON CONFLICT (keyword) DO NOTHING;

CREATE INDEX search_keywords_active_idx ON search_keywords(status, sort_order DESC, keyword);
