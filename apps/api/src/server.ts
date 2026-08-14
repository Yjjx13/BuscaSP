import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { db } from './db.js';
import { config } from './config.js';
import './types.js';
import { authRoutes } from './auth.js';
import { productRoutes } from './routes/products.js';
import { wantedRoutes } from './routes/wanted.js';
import { reportRoutes } from './routes/reports.js';
import { userRoutes } from './routes/users.js';
import { uploadRoutes } from './routes/uploads.js';
import { adminRoutes } from './routes/admin.js';

declare module 'fastify' { interface FastifyInstance { pg: typeof db } }

const app = Fastify({ logger: true });
app.decorate('pg', db);
await app.register(cors, { origin: config.corsOrigin, credentials: true });
await app.register(jwt, { secret: config.jwtSecret });
await app.register(multipart);
await app.register(fastifyStatic, { root: join(process.cwd(), 'uploads'), prefix: '/uploads/', decorateReply: false });

app.get('/health', async () => {
  await db.query('SELECT 1');
  return { ok: true, service: 'buscasp-api' };
});
await authRoutes(app);
await userRoutes(app);
await uploadRoutes(app);
await productRoutes(app);
await wantedRoutes(app);
await reportRoutes(app);
await adminRoutes(app);

app.setErrorHandler((error, _request, reply) => {
  if (typeof error === 'object' && error !== null && 'issues' in error) {
    return reply.code(400).send({ code: 'VALIDATION_ERROR', message: '输入信息不符合要求', details: error.issues });
  }
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : '请求不符合要求';
    return reply.code(error.statusCode).send({ code: 'REQUEST_ERROR', message });
  }
  app.log.error(error);
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message: '系统繁忙，请稍后再试' });
});

await app.listen({ port: config.port, host: '0.0.0.0' });
