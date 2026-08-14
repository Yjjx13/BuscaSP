import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { extname, join } from 'node:path';
import { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';

const allowedMimeTypes: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'
};
const uploadDir = join(process.cwd(), 'uploads');

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/api/v1/uploads/images', async (request, reply) => {
    await requireUser(request);
    const file = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
    if (!file) return reply.code(400).send({ code: 'IMAGE_REQUIRED', message: '请上传一张图片' });
    const extension = allowedMimeTypes[file.mimetype];
    if (!extension) return reply.code(400).send({ code: 'UNSUPPORTED_IMAGE', message: '仅支持 JPG、PNG 或 WebP 图片' });
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
    const name = `${randomUUID()}${extension || extname(file.filename)}`;
    await pipeline(file.file, createWriteStream(join(uploadDir, name), { flags: 'wx' }));
    if (file.file.truncated) return reply.code(413).send({ code: 'IMAGE_TOO_LARGE', message: '图片不能超过 10MB' });
    const protocol = request.protocol;
    const origin = `${protocol}://${request.headers.host}`;
    return reply.code(201).send({ objectKey: `${origin}/uploads/${name}`, thumbKey: `${origin}/uploads/${name}` });
  });
}

