-- Idempotent local test data sourced from D:\BuscaSP\testIMP.
INSERT INTO users (wechat_openid, nickname, login_source, last_login_at)
VALUES
  ('seed_testimp_perfume', '香氛货源店', 'DEV', NOW()),
  ('seed_testimp_toys', '趣玩批发商行', 'DEV', NOW()),
  ('seed_testimp_gifts', '创意礼品仓', 'DEV', NOW()),
  ('seed_testimp_squishy', '解压玩具工厂店', 'DEV', NOW())
ON CONFLICT (wechat_openid) DO UPDATE SET
  nickname = EXCLUDED.nickname,
  login_source = 'DEV',
  updated_at = NOW();

WITH seed_products(openid, description, price, price_unit, quantity, quantity_unit, spec_text, source_key, image_url) AS (
  VALUES
    ('seed_testimp_perfume', 'Lattafa 阿拉伯香水货源，包含 ASAD 黑金款、棕色款及 YARA 粉色款，礼盒包装，适合香水店与礼品店进货。', 149.90::numeric, '瓶', 48::numeric, '瓶', '100ml/瓶，多款香型可选', 'testimp-01', 'http://127.0.0.1:3000/uploads/testimp-perfume-100ml.jpg'),
    ('seed_testimp_toys', '彩色包子造型慢回弹捏捏乐，随机颜色独立盒装，适合玩具店、礼品店及活动赠品。', 12.90::numeric, '个', 144::numeric, '个', 'YX-134；约8.5×5cm；160g；6色混装', 'testimp-02', 'http://127.0.0.1:3000/uploads/testimp-bun-squishy.jpg'),
    ('seed_testimp_gifts', '黄油块造型慢回弹解压玩具，小巧便携，柔软可捏，适合礼品店和儿童玩具批发。', 18.90::numeric, '个', 120::numeric, '个', '4oz/113g；约10.5×3×3cm', 'testimp-03', 'http://127.0.0.1:3000/uploads/testimp-butter-113g.jpg'),
    ('seed_testimp_squishy', '大号黄油造型解压捏捏玩具，慢回弹材质，手感柔软，适合解压玩具及创意礼品渠道。', 32.90::numeric, '个', 96::numeric, '个', 'YX-194；14oz/400g；约22×6×6cm', 'testimp-04', 'http://127.0.0.1:3000/uploads/testimp-butter-400g.jpg')
), inserted AS (
  INSERT INTO products (user_id, description, price_type, price, price_unit, quantity, quantity_unit, spec_text, extra_attrs, expires_at)
  SELECT u.id, s.description, 'FIXED', s.price, s.price_unit, s.quantity, s.quantity_unit, s.spec_text,
         jsonb_build_object('seed_source', s.source_key), NOW() + INTERVAL '365 days'
  FROM seed_products s
  JOIN users u ON u.wechat_openid = s.openid
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.extra_attrs->>'seed_source' = s.source_key AND p.deleted_at IS NULL)
  RETURNING id, extra_attrs
)
INSERT INTO product_images (product_id, object_key, thumb_key, sort_order, is_cover, moderation_status)
SELECT i.id, s.image_url, s.image_url, 1, TRUE, 'APPROVED'
FROM inserted i
JOIN seed_products s ON s.source_key = i.extra_attrs->>'seed_source';
