-- Local demo data based on ten publicly visible product cards in the user's Mercado page.
-- Cover images remain referenced by their public HTTPS image URLs for local-only testing.
INSERT INTO users (wechat_openid, nickname, login_source, last_login_at)
VALUES
  ('seed_mercado_print_1', '圣保罗办公设备', 'DEV', NOW()),
  ('seed_mercado_print_2', '标签打印货源', 'DEV', NOW()),
  ('seed_mercado_print_3', '商用打印仓', 'DEV', NOW()),
  ('seed_mercado_print_4', '数码设备商行', 'DEV', NOW())
ON CONFLICT (wechat_openid) DO UPDATE SET nickname=EXCLUDED.nickname, login_source='DEV', updated_at=NOW();

WITH seed_products(openid, description, price, spec_text, source_key, image_url) AS (
  VALUES
    ('seed_mercado_print_1', 'HP DeskJet Ink Advantage 2975 彩色无线多功能打印机，适合家庭与小型办公使用。', 499.00::numeric, 'HP 2975；彩色喷墨；Wi‑Fi；USB；双电压', 'mercado-print-01', 'https://http2.mlstatic.com/D_Q_NP_2X_641445-MLA107256158981_022026-AB.webp'),
    ('seed_mercado_print_1', 'HP Smart Tank 584 黑色无线墨仓多功能打印机，适合高频文档打印。', 799.00::numeric, 'HP Smart Tank 584；墨仓式；无线；黑色', 'mercado-print-02', 'https://http2.mlstatic.com/D_Q_NP_2X_847584-MLA113137412934_072026-T.webp'),
    ('seed_mercado_print_2', '便携蓝牙迷你打印机套装，含 10 卷耗材，支持手机应用与二维码订单打印。', 138.53::numeric, '便携式；蓝牙；含10卷；小票/标签打印', 'mercado-print-03', 'https://http2.mlstatic.com/D_Q_NP_2X_603178-MLA113305607764_072026-T.webp'),
    ('seed_mercado_print_2', 'HP2 便携标签打印机，含 3 卷标签耗材，适合仓储、收纳与发货标签。', 112.00::numeric, 'HP2；便携标签机；含3卷；白色', 'mercado-print-04', 'https://http2.mlstatic.com/D_Q_NP_2X_788578-MLA113900285536_072026-T.webp'),
    ('seed_mercado_print_1', 'HP Smart Tank 210 彩色无线墨仓打印机，支持 Wi‑Fi Direct。', 876.00::numeric, 'HP Smart Tank 210；彩色；Wi‑Fi Direct；USB；双电压', 'mercado-print-05', 'https://http2.mlstatic.com/D_Q_NP_2X_665429-MLA113931363844_072026-T.webp'),
    ('seed_mercado_print_3', 'Knup KP-IM608 热敏标签打印机，支持 USB 与蓝牙，适合快递面单及商品标签。', 371.00::numeric, 'KP-IM608；100mm；USB+蓝牙；160mm/s', 'mercado-print-06', 'https://http2.mlstatic.com/D_Q_NP_2X_822647-MLA100012352491_122025-T.webp'),
    ('seed_mercado_print_2', '无线迷你便携标签打印机，含 10 卷贴纸，适合价格标签和收纳标识。', 91.00::numeric, '无线；便携；含10卷贴纸；迷你款', 'mercado-print-07', 'https://http2.mlstatic.com/D_Q_NP_2X_727162-MLB104700507257_012026-T-mini-impressora-portatil-sem-fio-com-10-rolo-adesivos-bl.webp'),
    ('seed_mercado_print_3', 'Elgin i7 Plus USB 热敏小票打印机，适合收银台与订单小票场景。', 514.07::numeric, 'Elgin i7 Plus；热敏；USB；黑色', 'mercado-print-08', 'https://http2.mlstatic.com/D_Q_NP_2X_748032-MLA99491903556_112025-T.webp'),
    ('seed_mercado_print_4', 'Epson EcoTank L3250 彩色多功能墨仓打印机，适合家庭、工作室及小型企业。', 1099.00::numeric, 'Epson L3250；彩色；墨仓式；无线', 'mercado-print-09', 'https://http2.mlstatic.com/D_Q_NP_2X_867179-MLA99966959445_112025-T.webp'),
    ('seed_mercado_print_4', 'Niimbot D110 迷你蓝牙标签打印机，可充电，适合价格签和仓库标签。', 138.22::numeric, 'Niimbot D110；蓝牙；热敏；USB充电', 'mercado-print-10', 'https://http2.mlstatic.com/D_Q_NP_2X_677936-MLA115024990491_072026-T.webp')
), inserted AS (
  INSERT INTO products (user_id, description, price_type, price, price_unit, quantity, quantity_unit, spec_text, extra_attrs, expires_at)
  SELECT u.id, s.description, 'FIXED', s.price, '台', 10::numeric, '台', s.spec_text,
         jsonb_build_object('seed_source', s.source_key, 'source_platform', 'Mercado Livre'), NOW() + INTERVAL '365 days'
  FROM seed_products s JOIN users u ON u.wechat_openid=s.openid
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.extra_attrs->>'seed_source'=s.source_key AND p.deleted_at IS NULL)
  RETURNING id, extra_attrs
)
INSERT INTO product_images (product_id, object_key, thumb_key, sort_order, is_cover, moderation_status)
SELECT i.id, s.image_url, s.image_url, 1, TRUE, 'APPROVED'
FROM inserted i JOIN seed_products s ON s.source_key=i.extra_attrs->>'seed_source';
