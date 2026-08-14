import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';

export async function reportRoutes(app: FastifyInstance) {
  app.post('/api/v1/reports', async (request, reply) => {
    const userId = await requireUser(request);
    const body = z.object({
      targetType: z.enum(['PRODUCT', 'WANTED', 'USER']), targetId: z.number().int().positive(),
      reasonCode: z.enum(['FAKE', 'SOLD_OUT', 'FAKE_PRICE', 'STOLEN_IMAGE', 'PROHIBITED', 'FRAUD', 'INVALID_CONTACT', 'SPAM', 'OTHER']),
      description: z.string().max(500).optional()
    }).parse(request.body);
    const result = await app.pg.query(`INSERT INTO reports (reporter_user_id,target_type,target_id,reason_code,description)
      VALUES ($1,$2,$3,$4,$5) RETURNING id,status,created_at`, [userId, body.targetType, body.targetId, body.reasonCode, body.description ?? null]);
    return reply.code(201).send(result.rows[0]);
  });
}

