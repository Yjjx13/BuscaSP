import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { decrypt } from '../crypto.js';

const wantedInput = z.object({
  description: z.string().trim().min(2).max(1000),
  imageKeys: z.array(z.string().max(500)).min(1).max(9),
  categoryId: z.number().int().positive().optional(),
  targetPrice: z.number().nonnegative().optional(),
  quantity: z.string().trim().min(1).max(50),
  specText: z.string().max(200).optional(),
  regionCode: z.string().max(20).optional(),
  validDays: z.number().int().min(3).max(30).default(7)
}).superRefine((value, ctx) => {
  if (!value.description) ctx.addIssue({ code: 'custom', path: ['description'], message: '请填写需求说明' });
  if (value.imageKeys.length === 0) ctx.addIssue({ code: 'custom', path: ['imageKeys'], message: '请至少上传 1 张参考图片' });
  if (!value.quantity) ctx.addIssue({ code: 'custom', path: ['quantity'], message: '请填写所需数量' });
});

const supplyOfferInput = z.object({
  offerPrice: z.number().nonnegative(),
  availableQuantity: z.string().trim().min(1).max(50),
  stockType: z.enum(['SPOT', 'PRESALE']),
  expectedAvailableAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  message: z.string().trim().max(300).optional()
}).superRefine((value, ctx) => {
  if (value.stockType === 'PRESALE' && !value.expectedAvailableAt) {
    ctx.addIssue({ code: 'custom', path: ['expectedAvailableAt'], message: '预售货源必须填写预计可交货日期' });
  }
});

async function attachOfferHistory(app: FastifyInstance, rows: Record<string, any>[]) {
  if (!rows.length) return rows;
  const responseIds = rows.map(row => Number(row.id));
  const offers = await app.pg.query(`SELECT o.*,u.nickname AS sender_nickname,
    CASE WHEN o.sender_user_id=wr.responder_user_id THEN 'SUPPLIER' ELSE 'BUYER' END AS sender_role
    FROM wanted_response_offers o JOIN wanted_responses wr ON wr.id=o.wanted_response_id
    JOIN users u ON u.id=o.sender_user_id
    WHERE o.wanted_response_id=ANY($1::bigint[]) ORDER BY o.created_at,o.id`, [responseIds]);
  const grouped = new Map<string, any[]>();
  for (const offer of offers.rows) {
    const key = String(offer.wanted_response_id);
    const list = grouped.get(key) ?? [];
    list.push(offer);
    grouped.set(key, list);
  }
  return rows.map(row => ({ ...row, offers: grouped.get(String(row.id)) ?? [] }));
}

export async function wantedRoutes(app: FastifyInstance) {
  app.get('/api/v1/me/wanted-posts', async (request) => {
    const userId = await requireUser(request);
    const result = await app.pg.query(`SELECT w.*,
      COUNT(r.id) FILTER (WHERE r.status <> 'WITHDRAWN')::int AS response_count,
      COUNT(r.id) FILTER (WHERE r.read_at IS NULL AND r.status = 'ACTIVE')::int AS unread_response_count,
      (SELECT wi.object_key FROM wanted_images wi WHERE wi.wanted_post_id=w.id ORDER BY wi.sort_order LIMIT 1) AS cover_url
      FROM wanted_posts w
      LEFT JOIN wanted_responses r ON r.wanted_post_id=w.id
      WHERE w.user_id=$1 AND w.deleted_at IS NULL
      GROUP BY w.id ORDER BY w.created_at DESC,w.id DESC`, [userId]);
    return { items: result.rows };
  });
  app.get('/api/v1/me/wanted-responses', async (request) => {
    const userId = await requireUser(request);
    const result = await app.pg.query(`SELECT wr.*,w.description AS wanted_description,w.status AS wanted_status,w.expires_at,
      COALESCE((SELECT o.offer_price FROM wanted_response_offers o WHERE o.wanted_response_id=wr.id
        AND o.sender_user_id=wr.responder_user_id ORDER BY o.created_at DESC,o.id DESC LIMIT 1),wr.offer_price) AS supplier_price,
      (SELECT wi.object_key FROM wanted_images wi WHERE wi.wanted_post_id=w.id ORDER BY wi.sort_order LIMIT 1) AS cover_url
      FROM wanted_responses wr JOIN wanted_posts w ON w.id=wr.wanted_post_id
      WHERE wr.responder_user_id=$1 AND wr.status <> 'WITHDRAWN' AND w.deleted_at IS NULL
      ORDER BY wr.updated_at DESC,wr.id DESC`, [userId]);
    return { items: result.rows };
  });
  app.get('/api/v1/wanted-posts', async (request) => {
    const query = z.object({ q: z.string().trim().max(100).optional() }).parse(request.query);
    const values: unknown[] = [];
    const clauses = ["w.status='ACTIVE'", 'w.expires_at > NOW()', 'w.deleted_at IS NULL'];
    if (query.q) { values.push(query.q); clauses.push(`(COALESCE(w.description,'') ILIKE '%' || $${values.length} || '%' OR COALESCE(w.quantity,'') ILIKE '%' || $${values.length} || '%' OR COALESCE(w.spec_text,'') ILIKE '%' || $${values.length} || '%')`); }
    const result = await app.pg.query(`SELECT w.*, u.nickname, u.avatar_url,
      (SELECT wi.object_key FROM wanted_images wi WHERE wi.wanted_post_id=w.id ORDER BY wi.sort_order LIMIT 1) AS cover_url
      FROM wanted_posts w JOIN users u ON u.id=w.user_id
      WHERE ${clauses.join(' AND ')} ORDER BY w.created_at DESC,w.id DESC LIMIT 50`, values);
    return { items: result.rows };
  });

  app.get('/api/v1/wanted-posts/:id', async (request, reply) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const result = await app.pg.query(`SELECT w.*,u.nickname,u.avatar_url,r.name AS region_name,
      COALESCE((SELECT json_agg(json_build_object('object_key',wi.object_key,'sort_order',wi.sort_order) ORDER BY wi.sort_order)
        FROM wanted_images wi WHERE wi.wanted_post_id=w.id),'[]'::json) AS images,
      EXISTS(SELECT 1 FROM wanted_responses wr WHERE wr.wanted_post_id=w.id AND wr.responder_user_id=$2 AND wr.status <> 'WITHDRAWN') AS has_responded,
      (SELECT wr.id FROM wanted_responses wr WHERE wr.wanted_post_id=w.id AND wr.responder_user_id=$2 AND wr.status <> 'WITHDRAWN' LIMIT 1) AS my_response_id,
      (w.user_id=$2) AS is_owner
      FROM wanted_posts w JOIN users u ON u.id=w.user_id
      LEFT JOIN sao_paulo_regions r ON r.code=COALESCE(w.region_code,u.region_code)
      WHERE w.id=$1 AND w.deleted_at IS NULL`, [id, userId]);
    if (!result.rows[0]) return reply.code(404).send({ code: 'WANTED_NOT_FOUND', message: '找货需求不存在或已删除' });
    return result.rows[0];
  });

  app.get('/api/v1/me/wanted-posts/:id/responses', async (request, reply) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const owned = await app.pg.query('SELECT id FROM wanted_posts WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [id, userId]);
    if (!owned.rows[0]) return reply.code(404).send({ code: 'WANTED_NOT_FOUND', message: '找货需求不存在或无权查看' });
    await app.pg.query(`UPDATE wanted_responses SET read_at=COALESCE(read_at,NOW()),updated_at=NOW()
      WHERE wanted_post_id=$1 AND read_at IS NULL`, [id]);
    const result = await app.pg.query(`SELECT wr.*,u.nickname,u.avatar_url,r.name AS region_name,u.contact_policy,
      EXISTS(SELECT 1 FROM user_contacts uc WHERE uc.user_id=wr.responder_user_id) AS has_contact,
      (SELECT uc.contact_type FROM user_contacts uc WHERE uc.user_id=wr.responder_user_id ORDER BY uc.is_primary DESC,uc.id DESC LIMIT 1) AS contact_type,
      p.description AS product_title,p.price AS product_price,p.price_unit AS product_price_unit,
      (SELECT pi.object_key FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.is_cover DESC,pi.sort_order LIMIT 1) AS product_cover_url
      FROM wanted_responses wr JOIN users u ON u.id=wr.responder_user_id
      LEFT JOIN sao_paulo_regions r ON r.code=u.region_code
      LEFT JOIN products p ON p.id=wr.product_id AND p.deleted_at IS NULL
      WHERE wr.wanted_post_id=$1 AND wr.status <> 'WITHDRAWN'
      ORDER BY wr.created_at DESC,wr.id DESC`, [id]);
    return { items: await attachOfferHistory(app, result.rows) };
  });

  app.post('/api/v1/wanted-posts', async (request, reply) => {
    const userId = await requireUser(request);
    const body = wantedInput.parse(request.body);
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      const created = await client.query(`INSERT INTO wanted_posts (user_id,category_id,description,target_price,quantity,spec_text,region_code,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() + ($8 || ' days')::interval) RETURNING *`,
        [userId, body.categoryId ?? null, body.description ?? null, body.targetPrice ?? null, body.quantity ?? null, body.specText ?? null, body.regionCode ?? null, body.validDays]);
      for (const [index, key] of body.imageKeys.entries()) await client.query('INSERT INTO wanted_images (wanted_post_id,object_key,sort_order) VALUES ($1,$2,$3)', [created.rows[0].id, key, index + 1]);
      await client.query('COMMIT');
      return reply.code(201).send(created.rows[0]);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });

  app.post('/api/v1/wanted-posts/:id/responses', async (request, reply) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = supplyOfferInput.and(z.object({ productId: z.number().int().positive().optional() })).parse(request.body);
    const wanted = await app.pg.query(`SELECT id,user_id,status,expires_at FROM wanted_posts
      WHERE id=$1 AND deleted_at IS NULL`, [id]);
    if (!wanted.rows[0]) return reply.code(404).send({ code: 'WANTED_NOT_FOUND', message: '找货需求不存在' });
    if (Number(wanted.rows[0].user_id) === userId) return reply.code(400).send({ code: 'OWN_WANTED_RESPONSE', message: '不能回应自己发布的找货需求' });
    if (wanted.rows[0].status !== 'ACTIVE' || new Date(wanted.rows[0].expires_at) <= new Date()) return reply.code(409).send({ code: 'WANTED_CLOSED', message: '该找货需求已结束' });
    if (body.productId) {
      const product = await app.pg.query(`SELECT id FROM products WHERE id=$1 AND user_id=$2 AND status='PUBLISHED' AND deleted_at IS NULL`, [body.productId, userId]);
      if (!product.rows[0]) return reply.code(400).send({ code: 'INVALID_PRODUCT', message: '只能关联自己当前上架的商品' });
    }
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`INSERT INTO wanted_responses (wanted_post_id,responder_user_id,product_id,message,offer_price,available_quantity,stock_type,expected_available_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (wanted_post_id,responder_user_id)
        DO UPDATE SET product_id=EXCLUDED.product_id,message=EXCLUDED.message,offer_price=EXCLUDED.offer_price,
          available_quantity=EXCLUDED.available_quantity,stock_type=EXCLUDED.stock_type,expected_available_at=EXCLUDED.expected_available_at,
          status='ACTIVE',read_at=NULL,updated_at=NOW() RETURNING *`,
        [id, userId, body.productId ?? null, body.message ?? null, body.offerPrice, body.availableQuantity, body.stockType, body.expectedAvailableAt ?? null]);
      await client.query(`INSERT INTO wanted_response_offers (wanted_response_id,sender_user_id,offer_price,available_quantity,message,stock_type,expected_available_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [result.rows[0].id, userId, body.offerPrice, body.availableQuantity, body.message ?? null, body.stockType, body.expectedAvailableAt ?? null]);
      await client.query('COMMIT');
      return reply.code(201).send(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });

  app.get('/api/v1/wanted-responses/:id', async (request, reply) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const result = await app.pg.query(`SELECT wr.*,u.nickname,u.avatar_url,r.name AS region_name,u.contact_policy,
      EXISTS(SELECT 1 FROM user_contacts uc WHERE uc.user_id=wr.responder_user_id) AS has_contact,
      p.description AS product_title,p.price AS product_price,p.price_unit AS product_price_unit,
      (SELECT pi.object_key FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.is_cover DESC,pi.sort_order LIMIT 1) AS product_cover_url
      FROM wanted_responses wr JOIN wanted_posts w ON w.id=wr.wanted_post_id JOIN users u ON u.id=wr.responder_user_id
      LEFT JOIN sao_paulo_regions r ON r.code=u.region_code LEFT JOIN products p ON p.id=wr.product_id AND p.deleted_at IS NULL
      WHERE wr.id=$1 AND (w.user_id=$2 OR wr.responder_user_id=$2) AND wr.status <> 'WITHDRAWN'`, [id, userId]);
    if (!result.rows[0]) return reply.code(404).send({ code: 'RESPONSE_NOT_FOUND', message: '供货响应不存在或无权查看' });
    return (await attachOfferHistory(app, result.rows))[0];
  });

  app.post('/api/v1/wanted-responses/:id/offers', async (request, reply) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = supplyOfferInput.parse(request.body);
    const response = await app.pg.query(`SELECT wr.*,w.user_id AS buyer_user_id,w.status AS wanted_status,w.expires_at
      FROM wanted_responses wr JOIN wanted_posts w ON w.id=wr.wanted_post_id
      WHERE wr.id=$1 AND w.deleted_at IS NULL AND wr.status='ACTIVE'`, [id]);
    const item = response.rows[0];
    if (!item) return reply.code(404).send({ code: 'RESPONSE_NOT_FOUND', message: '供货响应不存在或已结束' });
    if (![Number(item.responder_user_id), Number(item.buyer_user_id)].includes(userId)) return reply.code(403).send({ code: 'OFFER_FORBIDDEN', message: '无权参与该报价' });
    if (item.wanted_status !== 'ACTIVE' || new Date(item.expires_at) <= new Date()) return reply.code(409).send({ code: 'WANTED_CLOSED', message: '该找货需求已结束' });
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      const created = await client.query(`INSERT INTO wanted_response_offers (wanted_response_id,sender_user_id,offer_price,available_quantity,message,stock_type,expected_available_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, userId, body.offerPrice, body.availableQuantity, body.message ?? null, body.stockType, body.expectedAvailableAt ?? null]);
      await client.query(`UPDATE wanted_responses SET offer_price=$1,available_quantity=$2,message=COALESCE($3,message),
        stock_type=$4,expected_available_at=$5,read_at=CASE WHEN responder_user_id=$6 THEN NULL ELSE read_at END,updated_at=NOW() WHERE id=$7`,
        [body.offerPrice, body.availableQuantity, body.message ?? null, body.stockType, body.expectedAvailableAt ?? null, userId, id]);
      await client.query('COMMIT');
      return reply.code(201).send(created.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });

  app.patch('/api/v1/wanted-responses/:id', async (request, reply) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = z.object({ status: z.enum(['ACCEPTED', 'REJECTED']) }).parse(request.body);
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      const owned = await client.query(`SELECT wr.id,wr.status,w.id AS wanted_id,w.status AS wanted_status,w.expires_at
        FROM wanted_responses wr JOIN wanted_posts w ON w.id=wr.wanted_post_id
        WHERE wr.id=$1 AND w.user_id=$2 AND w.deleted_at IS NULL FOR UPDATE OF w,wr`, [id, userId]);
      const item = owned.rows[0];
      if (!item) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ code: 'RESPONSE_NOT_FOUND', message: '报价不存在或无权操作' });
      }
      if (item.status !== 'ACTIVE' || item.wanted_status !== 'ACTIVE' || new Date(item.expires_at) <= new Date()) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ code: 'WANTED_CLOSED', message: '需求或报价已结束，请刷新后查看' });
      }
      const result = await client.query(`UPDATE wanted_responses SET status=$1,read_at=COALESCE(read_at,NOW()),updated_at=NOW() WHERE id=$2 RETURNING *`, [body.status, id]);
      if (body.status === 'ACCEPTED') await client.query(`UPDATE wanted_posts SET status='FOUND',updated_at=NOW() WHERE id=$1`, [item.wanted_id]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });

  app.patch('/api/v1/wanted-posts/:id/status', async (request, reply) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = z.object({ status: z.enum(['ACTIVE', 'FOUND', 'CLOSED']) }).parse(request.body);
    const result = await app.pg.query(`UPDATE wanted_posts SET status=$1,updated_at=NOW()
      WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING *`, [body.status, id, userId]);
    if (!result.rows[0]) return reply.code(404).send({ code: 'WANTED_NOT_FOUND', message: '找货需求不存在或无权操作' });
    return result.rows[0];
  });

  app.post('/api/v1/wanted-responses/:id/contact', async (request, reply) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const response = await app.pg.query(`SELECT wr.id,wr.responder_user_id,u.nickname,u.contact_policy
      FROM wanted_responses wr JOIN wanted_posts w ON w.id=wr.wanted_post_id JOIN users u ON u.id=wr.responder_user_id
      WHERE wr.id=$1 AND w.user_id=$2 AND w.deleted_at IS NULL AND wr.status <> 'WITHDRAWN'`, [id, userId]);
    const item = response.rows[0];
    if (!item) return reply.code(404).send({ code: 'RESPONSE_NOT_FOUND', message: '供货响应不存在或无权查看' });
    if (item.contact_policy === 'MEMBER_ONLY') return reply.code(403).send({ code: 'MEMBER_REQUIRED', message: '该商家仅向会员开放联系方式' });
    const contact = await app.pg.query(`SELECT contact_type,value_cipher FROM user_contacts
      WHERE user_id=$1 ORDER BY is_primary DESC,id DESC LIMIT 1`, [item.responder_user_id]);
    if (!contact.rows[0]) return reply.code(404).send({ code: 'CONTACT_UNAVAILABLE', message: '商家暂未设置联系方式' });
    await app.pg.query(`INSERT INTO wanted_contact_events (wanted_response_id,viewer_user_id,responder_user_id,contact_type)
      VALUES ($1,$2,$3,$4)`, [id, userId, item.responder_user_id, contact.rows[0].contact_type]);
    return { responder: item.nickname, contactType: contact.rows[0].contact_type, value: decrypt(contact.rows[0].value_cipher) };
  });
}
