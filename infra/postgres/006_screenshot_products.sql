-- Local demo products created from the nine screenshots supplied by the user.
WITH seed_products(openid, description, price, quantity, spec_text, source_key, image_url) AS (
  VALUES
    ('seed_mercado_print_1', '棕色 PLA 3D 打印耗材线材，适合桌面级 3D 打印机制作模型与手工配件。', 99.90::numeric, 20::numeric, 'PLA；棕色；3D打印线材；1卷装', 'screenshot-3d-filament-brown', 'http://127.0.0.1:3000/uploads/screenshot-3d-filament-brown.png'),
    ('seed_mercado_print_1', 'Maxprint 白色 3D 打印耗材线材，适合模型打样与日常打印使用。', 89.90::numeric, 18::numeric, 'Maxprint；白色；3D打印线材；1卷装', 'screenshot-3d-filament-white', 'http://127.0.0.1:3000/uploads/screenshot-3d-filament-white.png'),
    ('seed_mercado_print_2', '迷你电煮锅，带玻璃盖与电源线，适合煮面、煮粥与小份烹饪。', 129.90::numeric, 15::numeric, '迷你电煮锅；带玻璃盖；插电式', 'screenshot-mini-cooker', 'http://127.0.0.1:3000/uploads/screenshot-mini-cooker.png'),
    ('seed_mercado_print_2', '钻石纹玻璃碗套装，透明加厚玻璃，适合甜品、沙拉和餐桌摆盘。', 79.90::numeric, 30::numeric, '透明玻璃；钻石纹；多只套装', 'screenshot-glass-bowl-set', 'http://127.0.0.1:3000/uploads/screenshot-glass-bowl-set.png'),
    ('seed_mercado_print_3', '加厚透明玻璃水杯套装，竖纹杯身，适合餐饮店及家庭使用。', 69.90::numeric, 36::numeric, '透明玻璃；竖纹；多只套装', 'screenshot-glass-cup-set', 'http://127.0.0.1:3000/uploads/screenshot-glass-cup-set.png'),
    ('seed_mercado_print_3', '钻石纹透明玻璃杯 6 只装，适合冷饮、果汁和日常餐桌使用。', 59.90::numeric, 40::numeric, '透明玻璃；钻石纹；6只装', 'screenshot-diamond-cups', 'http://127.0.0.1:3000/uploads/screenshot-diamond-cups.png'),
    ('seed_mercado_print_4', 'Gooldensky 迷你蓝牙标签打印机，附 15×30mm 标签纸，适合价格签与收纳标签。', 119.90::numeric, 24::numeric, 'Gooldensky；蓝牙；15×30mm标签；便携式', 'screenshot-gooldensky-label-printer', 'http://127.0.0.1:3000/uploads/screenshot-gooldensky-label-printer.png'),
    ('seed_mercado_print_4', '便携式热敏小票打印机套装，含 10 卷小票纸，适合外卖、收款及订单打印。', 159.90::numeric, 20::numeric, '热敏；便携式；含10卷小票纸；USB充电', 'screenshot-thermal-printer', 'http://127.0.0.1:3000/uploads/screenshot-thermal-printer.png'),
    ('seed_mercado_print_4', 'HP 墨仓彩色打印机，附四色墨水，主打两年原装墨水供应。', 1099.90::numeric, 8::numeric, 'HP；彩色墨仓；四色墨水；2年墨水供应', 'screenshot-hp-ink-printer', 'http://127.0.0.1:3000/uploads/screenshot-hp-ink-printer.png')
), inserted AS (
  INSERT INTO products (user_id, description, price_type, price, price_unit, quantity, quantity_unit, spec_text, extra_attrs, expires_at)
  SELECT u.id, s.description, 'FIXED', s.price, '件', s.quantity, '件', s.spec_text,
         jsonb_build_object('seed_source', s.source_key, 'source_platform', 'User screenshots'), NOW() + INTERVAL '365 days'
  FROM seed_products s JOIN users u ON u.wechat_openid=s.openid
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.extra_attrs->>'seed_source'=s.source_key AND p.deleted_at IS NULL)
  RETURNING id, extra_attrs
)
INSERT INTO product_images (product_id, object_key, thumb_key, sort_order, is_cover, moderation_status)
SELECT i.id, s.image_url, s.image_url, 1, TRUE, 'APPROVED'
FROM inserted i JOIN seed_products s ON s.source_key=i.extra_attrs->>'seed_source';
