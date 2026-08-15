import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { encrypt, maskContact } from '../crypto.js';

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/v1/regions', async () => {
    const result = await app.pg.query(`SELECT code,name,sort_order FROM sao_paulo_regions
      WHERE status='ACTIVE' ORDER BY sort_order,code`);
    return { city: 'São Paulo', items: result.rows };
  });

  app.get('/api/v1/me', async (request) => {
    const userId = await requireUser(request);
    const user = await app.pg.query(`SELECT u.id,u.nickname,u.avatar_url,u.region_code,r.name AS region_name,u.contact_policy,u.status,u.created_at
      FROM users u LEFT JOIN sao_paulo_regions r ON r.code=u.region_code
      WHERE u.id=$1 AND u.deleted_at IS NULL`, [userId]);
    return user.rows[0];
  });

  app.patch('/api/v1/me', async (request, reply) => {
    const userId = await requireUser(request);
    const body = z.object({ nickname: z.string().trim().min(1).max(80).optional(), avatarUrl: z.string().url().max(500).optional(), regionCode: z.string().max(20).optional(), contactPolicy: z.enum(['PUBLIC', 'LOGIN_ONLY', 'MEMBER_ONLY', 'AFTER_INQUIRY']).optional() }).parse(request.body);
    if (body.regionCode) {
      const region = await app.pg.query("SELECT code FROM sao_paulo_regions WHERE code=$1 AND status='ACTIVE'", [body.regionCode]);
      if (!region.rows[0]) return reply.code(400).send({ code: 'INVALID_REGION', message: '请选择有效的圣保罗地区' });
    }
    const row = await app.pg.query(`UPDATE users SET nickname=COALESCE($1,nickname),avatar_url=COALESCE($2,avatar_url),region_code=COALESCE($3,region_code),contact_policy=COALESCE($4,contact_policy),updated_at=NOW() WHERE id=$5 RETURNING id,nickname,avatar_url,region_code,contact_policy`, [body.nickname ?? null, body.avatarUrl ?? null, body.regionCode ?? null, body.contactPolicy ?? null, userId]);
    if (!row.rows[0]) return reply.code(404).send({ code: 'USER_NOT_FOUND', message: '用户不存在' });
    return row.rows[0];
  });

  app.get('/api/v1/users/:id/profile', async (request, reply) => {
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const user = await app.pg.query(`SELECT u.id,u.nickname,u.avatar_url,u.region_code,r.name AS region_name,u.created_at
      FROM users u LEFT JOIN sao_paulo_regions r ON r.code=u.region_code
      WHERE u.id=$1 AND u.status='ACTIVE' AND u.deleted_at IS NULL`, [id]);
    if (!user.rows[0]) return reply.code(404).send({ code: 'USER_NOT_FOUND', message: '发布者不存在' });
    const products = await app.pg.query(`SELECT id,description,price_type,price,price_unit,published_at,
      (SELECT thumb_key FROM product_images WHERE product_id=products.id ORDER BY sort_order LIMIT 1) AS cover_url
      FROM products WHERE user_id=$1 AND status='PUBLISHED' AND deleted_at IS NULL ORDER BY id DESC LIMIT 30`, [id]);
    return { ...user.rows[0], products: products.rows };
  });

  app.get('/api/v1/me/contacts', async (request) => {
    const userId = await requireUser(request);
    const contacts = await app.pg.query(`SELECT id,contact_type,masked_value,is_primary,created_at,updated_at
      FROM user_contacts WHERE user_id=$1 ORDER BY is_primary DESC,id DESC`, [userId]);
    return { items: contacts.rows };
  });

  app.put('/api/v1/me/contacts', async (request) => {
    const userId = await requireUser(request);
    const body = z.object({
      contactType: z.enum(['PHONE', 'WECHAT']),
      value: z.string().trim().min(4).max(80),
      isPrimary: z.boolean().default(true)
    }).superRefine((value, ctx) => {
      if (value.contactType === 'PHONE' && !/^[0-9+\-\s()]{6,30}$/.test(value.value)) ctx.addIssue({ code: 'custom', path: ['value'], message: '请输入正确的联系电话' });
      if (value.contactType === 'WECHAT' && !/^[a-zA-Z][-_a-zA-Z0-9]{3,63}$/.test(value.value)) ctx.addIssue({ code: 'custom', path: ['value'], message: '请输入正确的微信号' });
    }).parse(request.body);
    const result = await app.pg.query(`INSERT INTO user_contacts (user_id,contact_type,value_cipher,masked_value,is_primary)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id,contact_type) DO UPDATE SET value_cipher=EXCLUDED.value_cipher,masked_value=EXCLUDED.masked_value,is_primary=EXCLUDED.is_primary,updated_at=NOW()
      RETURNING id,contact_type,masked_value,is_primary,updated_at`, [userId, body.contactType, encrypt(body.value), maskContact(body.contactType, body.value), body.isPrimary]);
    return result.rows[0];
  });

  app.get('/api/v1/me/search-history', async (request) => {
    const userId = await requireUser(request);
    const result = await app.pg.query(`SELECT id,query_text,created_at FROM search_history
      WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, [userId]);
    return { items: result.rows };
  });

  app.post('/api/v1/me/search-history', async (request, reply) => {
    const userId = await requireUser(request);
    const body = z.object({ query: z.string().trim().min(1).max(100) }).parse(request.body);
    await app.pg.query('DELETE FROM search_history WHERE user_id=$1 AND query_text=$2', [userId, body.query]);
    const created = await app.pg.query(`INSERT INTO search_history (user_id,query_text) VALUES ($1,$2)
      RETURNING id,query_text,created_at`, [userId, body.query]);
    await app.pg.query(`DELETE FROM search_history WHERE id IN (
      SELECT id FROM search_history WHERE user_id=$1 ORDER BY created_at DESC OFFSET 10
    )`, [userId]);
    return reply.code(201).send(created.rows[0]);
  });

  app.delete('/api/v1/me/search-history', async (request) => {
    const userId = await requireUser(request);
    await app.pg.query('DELETE FROM search_history WHERE user_id=$1', [userId]);
    return { cleared: true };
  });
}
