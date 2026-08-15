import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';

const wantedInput = z.object({
  description: z.string().trim().min(2).max(1000).optional(),
  imageKeys: z.array(z.string().max(500)).max(9).default([]),
  categoryId: z.number().int().positive().optional(),
  targetPrice: z.number().nonnegative().optional(),
  quantity: z.string().max(50).optional(),
  specText: z.string().max(200).optional(),
  regionCode: z.string().max(20).optional(),
  validDays: z.number().int().min(3).max(30).default(7)
}).superRefine((value, ctx) => {
  if (!value.description && value.imageKeys.length === 0) ctx.addIssue({ code: 'custom', message: '请至少填写需求描述或上传参考图片' });
});

export async function wantedRoutes(app: FastifyInstance) {
  app.get('/api/v1/me/wanted-posts', async (request) => {
    const userId = await requireUser(request);
    const result = await app.pg.query(`SELECT w.*,COUNT(r.id)::int AS response_count FROM wanted_posts w
      LEFT JOIN wanted_responses r ON r.wanted_post_id=w.id AND r.status='ACTIVE'
      WHERE w.user_id=$1 AND w.deleted_at IS NULL
      GROUP BY w.id ORDER BY w.created_at DESC,w.id DESC`, [userId]);
    return { items: result.rows };
  });
  app.get('/api/v1/wanted-posts', async () => {
    const result = await app.pg.query(`SELECT w.*, u.nickname, u.avatar_url FROM wanted_posts w JOIN users u ON u.id=w.user_id
      WHERE w.status='ACTIVE' AND w.expires_at > NOW() AND w.deleted_at IS NULL ORDER BY w.id DESC LIMIT 30`);
    return { items: result.rows };
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
    const body = z.object({ productId: z.number().int().positive().optional(), message: z.string().max(300).optional() }).parse(request.body);
    const result = await app.pg.query(`INSERT INTO wanted_responses (wanted_post_id,responder_user_id,product_id,message)
      VALUES ($1,$2,$3,$4) ON CONFLICT (wanted_post_id,responder_user_id)
      DO UPDATE SET product_id=EXCLUDED.product_id,message=EXCLUDED.message,status='ACTIVE',updated_at=NOW() RETURNING *`, [id, userId, body.productId ?? null, body.message ?? null]);
    return reply.code(201).send(result.rows[0]);
  });
}
