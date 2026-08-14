import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { withTransaction } from '../db.js';
import { decrypt } from '../crypto.js';
import { productDescriptionError } from '../validation/product-description.js';

const productInput = z.object({
  description: z.string().trim().max(1000),
  priceType: z.enum(['FIXED', 'NEGOTIABLE']).default('FIXED'),
  price: z.number().nonnegative().nullable().optional(),
  priceUnit: z.string().max(30).optional(),
  categoryId: z.number().int().positive(),
  quantity: z.number().nonnegative().nullable().optional(),
  quantityUnit: z.string().max(30).optional(),
  specText: z.string().max(200).optional(),
  regionCode: z.string().max(20).optional(),
  extraAttrs: z.record(z.string(), z.unknown()).default({}),
  images: z.array(z.object({ objectKey: z.string().max(500), thumbKey: z.string().max(500).optional() })).min(1).max(9)
}).superRefine((value, ctx) => {
  const descriptionMessage = productDescriptionError(value.description);
  if (descriptionMessage) ctx.addIssue({ code: 'custom', path: ['description'], message: descriptionMessage });
  if (value.priceType === 'FIXED' && value.price === null) ctx.addIssue({ code: 'custom', path: ['price'], message: '固定价格必须填写金额' });
});

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  regionCode: z.string().max(20).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

async function findRelatedKeywords(app: FastifyInstance, query: string, limit = 8): Promise<string[]> {
  const result = await app.pg.query(`
    SELECT keyword,
      GREATEST(
        similarity(keyword, $1),
        COALESCE((SELECT MAX(similarity(alias, $1)) FROM unnest(aliases) AS alias), 0)
      ) AS score
    FROM search_keywords
    WHERE status='ACTIVE' AND (
      keyword ILIKE '%' || $1 || '%'
      OR EXISTS (SELECT 1 FROM unnest(aliases) AS alias WHERE alias ILIKE '%' || $1 || '%')
      OR similarity(keyword, $1) >= 0.22
      OR EXISTS (SELECT 1 FROM unnest(aliases) AS alias WHERE similarity(alias, $1) >= 0.30)
    )
    ORDER BY CASE WHEN keyword ILIKE $1 || '%' OR $1 = ANY(aliases) THEN 0 ELSE 1 END,
      score DESC, sort_order DESC, keyword
    LIMIT $2`, [query, limit]);
  return result.rows.map(row => row.keyword as string);
}

function secureImageUrl(value: unknown) {
  if (typeof value !== 'string' || !/^http:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    // The local development API deliberately has no TLS certificate.  Only
    // external product-image hosts need an HTTPS upgrade for the mini program.
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return value;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return value;
  }
}

function secureProductImages<T extends Record<string, any>>(product: T): T {
  return {
    ...product,
    cover_url: secureImageUrl(product.cover_url),
    images: Array.isArray(product.images)
      ? product.images.map((image: Record<string, any>) => ({
        ...image,
        object_key: secureImageUrl(image.object_key),
        thumb_key: secureImageUrl(image.thumb_key)
      }))
      : product.images
  };
}

export async function productRoutes(app: FastifyInstance) {
  app.get('/api/v1/categories/tree', async () => {
    const result = await app.pg.query(`SELECT id,parent_id,name,level,sort_order FROM categories
      WHERE status='ACTIVE' AND code LIKE 'TAX-V1-%' ORDER BY level,sort_order,id`);
    const byId = new Map<number, any>();
    const roots: any[] = [];
    for (const row of result.rows) byId.set(Number(row.id), { ...row, children: [] });
    for (const item of byId.values()) {
      if (item.parent_id) byId.get(Number(item.parent_id))?.children.push(item);
      else roots.push(item);
    }
    return { items: roots };
  });

  app.get('/api/v1/search-suggestions', async (request) => {
    const query = z.object({ q: z.string().trim().min(1).max(100) }).parse(request.query);
    return { items: await findRelatedKeywords(app, query.q) };
  });

  app.get('/api/v1/me/products', async (request) => {
    const userId = await requireUser(request);
    const result = await app.pg.query(`SELECT p.id,p.description,p.price_type,p.price,p.price_unit,p.status,p.published_at,p.expires_at,
      (SELECT thumb_key FROM product_images WHERE product_id=p.id ORDER BY sort_order LIMIT 1) AS cover_url
      FROM products p WHERE p.user_id=$1 AND p.deleted_at IS NULL ORDER BY p.id DESC`, [userId]);
    return { items: result.rows };
  });

  app.get('/api/v1/products', async (request) => {
    const q = listQuery.parse(request.query);
    const clauses = ["p.status = 'PUBLISHED'", 'p.deleted_at IS NULL', 'p.expires_at > NOW()'];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
    if (q.q) {
      const related = await findRelatedKeywords(app, q.q, 12);
      const terms = [...new Set([q.q, ...related])];
      values.push(terms);
      clauses.push(`(
        p.description ILIKE ANY(SELECT '%' || term || '%' FROM unnest($${values.length}::text[]) AS term)
        OR COALESCE(p.spec_text, '') ILIKE ANY(SELECT '%' || term || '%' FROM unnest($${values.length}::text[]) AS term)
      )`);
    }
    if (q.categoryId) add('p.category_id = ?', q.categoryId);
    if (q.regionCode) add('p.region_code = ?', q.regionCode);
    if (q.minPrice !== undefined) add('p.price >= ?', q.minPrice);
    if (q.maxPrice !== undefined) add('p.price <= ?', q.maxPrice);
    if (q.cursor) add('p.id < ?', q.cursor);
    values.push(q.limit + 1);
    const result = await app.pg.query(`
      SELECT p.id, p.description, p.price_type, p.price, p.price_unit, p.spec_text, p.quantity, p.quantity_unit, p.published_at,
             u.id AS user_id, u.nickname, u.avatar_url,
             (SELECT pi.thumb_key FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS cover_url
      FROM products p JOIN users u ON u.id = p.user_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY p.id DESC LIMIT $${values.length}`, values);
    const hasMore = result.rows.length > q.limit;
    const items = result.rows.slice(0, q.limit);
    return { items: items.map(secureProductImages), nextCursor: hasMore ? items.at(-1)?.id : null, hasMore };
  });

  app.post('/api/v1/products', async (request, reply) => {
    const userId = await requireUser(request);
    const body = productInput.parse(request.body);
    const category = await app.pg.query("SELECT id FROM categories WHERE id=$1 AND level=3 AND status='ACTIVE'", [body.categoryId]);
    if (!category.rows[0]) return reply.code(400).send({ code: 'INVALID_CATEGORY', message: '请选择有效的三级商品分类' });
    const product = await withTransaction(async (client) => {
      const created = await client.query(`
        INSERT INTO products (user_id, category_id, description, price_type, price, price_unit, quantity, quantity_unit, spec_text, region_code, extra_attrs)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [userId, body.categoryId ?? null, body.description, body.priceType, body.price ?? null, body.priceUnit ?? null,
          body.quantity ?? null, body.quantityUnit ?? null, body.specText ?? null, body.regionCode ?? null, body.extraAttrs]);
      for (const [index, image] of body.images.entries()) {
        await client.query('INSERT INTO product_images (product_id, object_key, thumb_key, sort_order, is_cover) VALUES ($1,$2,$3,$4,$5)',
          [created.rows[0].id, image.objectKey, image.thumbKey ?? image.objectKey, index + 1, index === 0]);
      }
      return created.rows[0];
    });
    return reply.code(201).send(product);
  });

  app.get('/api/v1/products/:id', async (request, reply) => {
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const product = await app.pg.query(`SELECT p.*, u.id AS publisher_id, u.nickname, u.avatar_url, u.contact_policy
      FROM products p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.status='PUBLISHED' AND p.deleted_at IS NULL`, [id]);
    if (!product.rows[0]) return reply.code(404).send({ code: 'PRODUCT_NOT_FOUND', message: '商品不存在或已下架' });
    const images = await app.pg.query('SELECT object_key, thumb_key, sort_order FROM product_images WHERE product_id=$1 ORDER BY sort_order', [id]);
    return secureProductImages({ ...product.rows[0], images: images.rows });
  });

  app.post('/api/v1/products/:id/status', async (request, reply) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = z.object({ status: z.enum(['PUBLISHED', 'OFF_SHELF', 'SOLD']) }).parse(request.body);
    const result = await app.pg.query('UPDATE products SET status=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING id,status', [body.status, id, userId]);
    if (!result.rows[0]) return reply.code(404).send({ code: 'PRODUCT_NOT_FOUND', message: '商品不存在或无权限' });
    return result.rows[0];
  });

  app.put('/api/v1/products/:id/favorite', async (request, reply) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const product = await app.pg.query("SELECT id FROM products WHERE id=$1 AND status='PUBLISHED' AND deleted_at IS NULL", [id]);
    if (!product.rows[0]) return reply.code(404).send({ code: 'PRODUCT_NOT_FOUND', message: '商品不存在或已下架' });
    await app.pg.query('INSERT INTO favorites (user_id,product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, id]);
    return { productId: id, favorited: true };
  });

  app.delete('/api/v1/products/:id/favorite', async (request) => {
    const userId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    await app.pg.query('DELETE FROM favorites WHERE user_id=$1 AND product_id=$2', [userId, id]);
    return { productId: id, favorited: false };
  });

  app.get('/api/v1/me/favorites', async (request) => {
    const userId = await requireUser(request);
    const result = await app.pg.query(`SELECT p.id,p.description,p.price_type,p.price,p.price_unit,p.region_code,p.published_at,
      u.nickname,(SELECT thumb_key FROM product_images WHERE product_id=p.id ORDER BY sort_order LIMIT 1) AS cover_url
      FROM favorites f JOIN products p ON p.id=f.product_id JOIN users u ON u.id=p.user_id
      WHERE f.user_id=$1 AND p.status='PUBLISHED' AND p.deleted_at IS NULL ORDER BY f.created_at DESC`, [userId]);
    return { items: result.rows };
  });

  app.post('/api/v1/products/:id/contact', async (request, reply) => {
    const viewerUserId = await requireUser(request);
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const product = await app.pg.query(`SELECT p.id,p.user_id,u.nickname,u.contact_policy FROM products p
      JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.status='PUBLISHED' AND p.deleted_at IS NULL`, [id]);
    if (!product.rows[0]) return reply.code(404).send({ code: 'PRODUCT_NOT_FOUND', message: '商品不存在或已下架' });
    const item = product.rows[0];
    if (item.contact_policy === 'MEMBER_ONLY') return reply.code(403).send({ code: 'MEMBER_REQUIRED', message: '该发布者仅向会员开放联系方式' });
    const contact = await app.pg.query(`SELECT contact_type,value_cipher FROM user_contacts WHERE user_id=$1 ORDER BY is_primary DESC,id DESC LIMIT 1`, [item.user_id]);
    if (!contact.rows[0]) return reply.code(404).send({ code: 'CONTACT_UNAVAILABLE', message: '发布者暂未设置联系方式' });
    await app.pg.query(`INSERT INTO contact_events (product_id,viewer_user_id,publisher_user_id,contact_type) VALUES ($1,$2,$3,$4)`, [id, viewerUserId, item.user_id, contact.rows[0].contact_type]);
    return { publisher: item.nickname, contactType: contact.rows[0].contact_type, value: decrypt(contact.rows[0].value_cipher) };
  });
}
