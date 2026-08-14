ALTER TABLE search_keywords ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

WITH keyword_data(keyword, sort_order, aliases) AS (
  VALUES
    ('厕所清洁剂', 100, ARRAY['厕所','卫生间','卫浴','马桶清洁']),
    ('厕所垃圾桶', 99, ARRAY['厕所','卫生间','卫浴','垃圾桶']),
    ('厕所刷', 98, ARRAY['厕所','卫生间','马桶刷']),
    ('厕所收纳架', 97, ARRAY['厕所','卫生间','卫浴收纳']),
    ('玻璃水杯', 80, ARRAY['杯子','水杯','玻璃杯','饮水杯','茶杯']),
    ('玻璃杯', 79, ARRAY['杯子','水杯','玻璃水杯','饮水杯','茶杯']),
    ('马克杯', 78, ARRAY['杯子','咖啡杯','茶杯']),
    ('咖啡杯', 77, ARRAY['杯子','马克杯','饮品杯']),
    ('保温杯', 76, ARRAY['杯子','水杯','随行杯']),
    ('一次性纸杯', 75, ARRAY['杯子','纸杯','饮品杯']),
    ('玻璃碗套装', 74, ARRAY['碗','餐具','玻璃餐具','沙拉碗']),
    ('餐具套装', 73, ARRAY['餐具','碗','杯子','厨房用品']),
    ('标签打印机', 90, ARRAY['标签机','打印机','热敏打印机','面单机']),
    ('热敏打印机', 89, ARRAY['小票机','打印机','收银打印机','标签机']),
    ('便携打印机', 88, ARRAY['迷你打印机','打印机','蓝牙打印机']),
    ('打印机墨水', 87, ARRAY['墨水','墨盒','打印耗材']),
    ('迷你电煮锅', 70, ARRAY['电煮锅','小锅','电饭锅','厨房小家电']),
    ('电饭锅', 69, ARRAY['煮饭锅','电煮锅','厨房小家电']),
    ('厨房小家电', 68, ARRAY['电煮锅','电饭锅','厨房用品']),
    ('3D打印耗材', 60, ARRAY['3D打印','打印线材','PLA','耗材']),
    ('PLA打印线材', 59, ARRAY['3D打印','3D打印耗材','打印线材','PLA']),
    ('香水礼盒', 50, ARRAY['香水','香氛','礼盒']),
    ('解压玩具', 49, ARRAY['玩具','捏捏乐','慢回弹']),
    ('捏捏乐', 48, ARRAY['玩具','解压玩具','慢回弹'])
)
INSERT INTO search_keywords (keyword, sort_order, aliases)
SELECT keyword, sort_order, aliases FROM keyword_data
ON CONFLICT (keyword) DO UPDATE SET aliases=EXCLUDED.aliases, sort_order=EXCLUDED.sort_order, updated_at=NOW();

CREATE INDEX IF NOT EXISTS search_keywords_aliases_idx ON search_keywords USING GIN (aliases);
