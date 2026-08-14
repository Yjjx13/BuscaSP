import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { productDescriptionError } from '../validation/product-description.js';
import { config } from '../config.js';
import { withTransaction } from '../db.js';

function requireAdmin(request: FastifyRequest) {
  if (request.headers['x-admin-key'] !== config.adminKey) {
    const error = new Error('管理员密钥无效') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }
}

const idParam = z.object({ id: z.coerce.number().int().positive() });
const productBody = z.object({
  userId: z.coerce.number().int().positive(), categoryId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().max(1000).superRefine((value, ctx) => { const message = productDescriptionError(value); if (message) ctx.addIssue({ code: 'custom', message }); }), priceType: z.enum(['FIXED', 'NEGOTIABLE']).default('FIXED'),
  price: z.coerce.number().nonnegative().nullable().optional(), priceUnit: z.string().max(30).default('元/件'),
  quantity: z.coerce.number().nonnegative().nullable().optional(), quantityUnit: z.string().max(30).nullable().optional(),
  specText: z.string().max(200).nullable().optional(), regionCode: z.string().max(20).nullable().optional(),
  status: z.enum(['PUBLISHED', 'OFF_SHELF', 'SOLD', 'VIOLATION']).default('PUBLISHED'), imageUrl: z.string().max(500).nullable().optional()
}).superRefine((value, ctx) => {
  if (value.priceType === 'FIXED' && value.price == null) ctx.addIssue({ code: 'custom', path: ['price'], message: '固定价格必须填写金额' });
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request) => {
    if (request.url.startsWith('/api/v1/admin/')) requireAdmin(request);
  });

  app.get('/api/v1/admin/stats', async () => {
    const result = await app.pg.query(`SELECT
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,
      (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL) AS products,
      (SELECT COUNT(*) FROM products WHERE status='PUBLISHED' AND deleted_at IS NULL) AS published_products,
      (SELECT COUNT(*) FROM wanted_posts WHERE status='ACTIVE' AND deleted_at IS NULL) AS active_wanted,
      (SELECT COUNT(*) FROM reports WHERE status='OPEN') AS open_reports,
      (SELECT COUNT(*) FROM contact_events) AS contacts`);
    return result.rows[0];
  });

  app.get('/api/v1/admin/products', async (request) => {
    const query = z.object({ q: z.string().max(100).optional(), status: z.string().max(30).optional() }).parse(request.query);
    const values: unknown[] = [];
    const clauses = ['p.deleted_at IS NULL'];
    if (query.q) { values.push(query.q); clauses.push(`(p.description ILIKE '%'||$${values.length}||'%' OR u.nickname ILIKE '%'||$${values.length}||'%')`); }
    if (query.status) { values.push(query.status); clauses.push(`p.status=$${values.length}`); }
    const result = await app.pg.query(`SELECT p.*,u.nickname,c.name AS category_name,
      (SELECT thumb_key FROM product_images WHERE product_id=p.id ORDER BY sort_order LIMIT 1) AS cover_url
      FROM products p JOIN users u ON u.id=p.user_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE ${clauses.join(' AND ')} ORDER BY p.id DESC LIMIT 200`, values);
    return { items: result.rows };
  });

  app.post('/api/v1/admin/products', async (request, reply) => {
    const body = productBody.parse(request.body);
    const row = await withTransaction(async (client) => {
      const created = await client.query(`INSERT INTO products
        (user_id,category_id,description,price_type,price,price_unit,quantity,quantity_unit,spec_text,region_code,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [body.userId,body.categoryId??null,body.description,body.priceType,body.price??null,body.priceUnit,body.quantity??null,body.quantityUnit??null,body.specText??null,body.regionCode??null,body.status]);
      if (body.imageUrl) await client.query(`INSERT INTO product_images (product_id,object_key,thumb_key,sort_order,is_cover,moderation_status)
        VALUES ($1,$2,$2,1,true,'PASSED')`, [created.rows[0].id, body.imageUrl]);
      return created.rows[0];
    });
    return reply.code(201).send(row);
  });

  app.put('/api/v1/admin/products/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params); const body = productBody.parse(request.body);
    const result = await app.pg.query(`UPDATE products SET user_id=$1,category_id=$2,description=$3,price_type=$4,price=$5,price_unit=$6,
      quantity=$7,quantity_unit=$8,spec_text=$9,region_code=$10,status=$11,updated_at=NOW() WHERE id=$12 AND deleted_at IS NULL RETURNING *`,
      [body.userId,body.categoryId??null,body.description,body.priceType,body.price??null,body.priceUnit,body.quantity??null,body.quantityUnit??null,body.specText??null,body.regionCode??null,body.status,id]);
    if (!result.rows[0]) return reply.code(404).send({ message: '商品不存在' }); return result.rows[0];
  });

  app.delete('/api/v1/admin/products/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const result = await app.pg.query("UPDATE products SET status='DELETED',deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id", [id]);
    if (!result.rows[0]) return reply.code(404).send({ message: '商品不存在' }); return { deleted: true };
  });

  app.get('/api/v1/admin/users', async () => ({ items: (await app.pg.query(`SELECT u.id,u.nickname,u.region_code,u.contact_policy,u.status,u.login_source,u.last_login_at,u.created_at,
    COUNT(DISTINCT p.id) FILTER (WHERE p.deleted_at IS NULL) AS product_count,COUNT(DISTINCT w.id) FILTER (WHERE w.deleted_at IS NULL) AS wanted_count
    FROM users u LEFT JOIN products p ON p.user_id=u.id LEFT JOIN wanted_posts w ON w.user_id=u.id WHERE u.deleted_at IS NULL GROUP BY u.id ORDER BY u.id DESC`)).rows }));

  app.get('/api/v1/admin/users/:id', async (request, reply) => {
    const {id}=idParam.parse(request.params);
    const user=(await app.pg.query(`SELECT id,nickname,avatar_url,region_code,contact_policy,status,login_source,last_login_at,created_at,updated_at
      FROM users WHERE id=$1 AND deleted_at IS NULL`,[id])).rows[0];
    if(!user)return reply.code(404).send({message:'用户不存在'});
    const [contacts,products,wanted]=await Promise.all([
      app.pg.query('SELECT contact_type,masked_value,is_primary,updated_at FROM user_contacts WHERE user_id=$1 ORDER BY is_primary DESC',[id]),
      app.pg.query('SELECT id,description,status,price,price_type,published_at FROM products WHERE user_id=$1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 50',[id]),
      app.pg.query('SELECT id,description,status,target_price,created_at FROM wanted_posts WHERE user_id=$1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 50',[id])
    ]);
    return {...user,contacts:contacts.rows,products:products.rows,wantedPosts:wanted.rows};
  });

  app.post('/api/v1/admin/users', async (request, reply) => {
    const body = z.object({ nickname:z.string().trim().min(1).max(80),regionCode:z.string().max(20).nullable().optional(),status:z.enum(['ACTIVE','LIMITED','BANNED']).default('ACTIVE') }).parse(request.body);
    const result = await app.pg.query(`INSERT INTO users (wechat_openid,nickname,region_code,status) VALUES ($1,$2,$3,$4) RETURNING *`, [`admin_seed_${Date.now()}`,body.nickname,body.regionCode??null,body.status]);
    return reply.code(201).send(result.rows[0]);
  });

  app.put('/api/v1/admin/users/:id', async (request, reply) => {
    const { id }=idParam.parse(request.params); const body=z.object({nickname:z.string().trim().min(1).max(80),regionCode:z.string().max(20).nullable().optional(),status:z.enum(['ACTIVE','LIMITED','BANNED']),contactPolicy:z.enum(['PUBLIC','LOGIN_ONLY','MEMBER_ONLY','AFTER_INQUIRY']).default('LOGIN_ONLY')}).parse(request.body);
    const result=await app.pg.query(`UPDATE users SET nickname=$1,region_code=$2,status=$3,contact_policy=$4,updated_at=NOW() WHERE id=$5 AND deleted_at IS NULL RETURNING *`,[body.nickname,body.regionCode??null,body.status,body.contactPolicy,id]);
    if(!result.rows[0])return reply.code(404).send({message:'用户不存在'});return result.rows[0];
  });

  app.delete('/api/v1/admin/users/:id', async (request, reply) => {
    const {id}=idParam.parse(request.params);const result=await app.pg.query("UPDATE users SET status='DELETED',deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id",[id]);
    if(!result.rows[0])return reply.code(404).send({message:'用户不存在'});return{deleted:true};
  });

  app.post('/api/v1/admin/users/:id/restore', async (request, reply) => {
    const {id}=idParam.parse(request.params);
    const result=await app.pg.query("UPDATE users SET status='ACTIVE',deleted_at=NULL,limited_until=NULL,updated_at=NOW() WHERE id=$1 RETURNING id,nickname,status",[id]);
    if(!result.rows[0])return reply.code(404).send({message:'用户不存在'});return result.rows[0];
  });

  app.get('/api/v1/admin/wanted-posts', async () => ({ items:(await app.pg.query(`SELECT w.*,u.nickname,c.name AS category_name,
    (SELECT COUNT(*) FROM wanted_responses r WHERE r.wanted_post_id=w.id AND r.status='ACTIVE') AS response_count
    FROM wanted_posts w JOIN users u ON u.id=w.user_id LEFT JOIN categories c ON c.id=w.category_id WHERE w.deleted_at IS NULL ORDER BY w.id DESC`)).rows }));

  app.post('/api/v1/admin/wanted-posts', async (request, reply) => {
    const b=z.object({userId:z.coerce.number().int().positive(),categoryId:z.coerce.number().int().positive().nullable().optional(),description:z.string().trim().min(2).max(1000),targetPrice:z.coerce.number().nonnegative().nullable().optional(),quantity:z.string().max(50).nullable().optional(),specText:z.string().max(200).nullable().optional(),regionCode:z.string().max(20).nullable().optional(),status:z.enum(['ACTIVE','FOUND','EXPIRED','OFF_SHELF','VIOLATION']).default('ACTIVE')}).parse(request.body);
    const result=await app.pg.query(`INSERT INTO wanted_posts (user_id,category_id,description,target_price,quantity,spec_text,region_code,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[b.userId,b.categoryId??null,b.description,b.targetPrice??null,b.quantity??null,b.specText??null,b.regionCode??null,b.status]);return reply.code(201).send(result.rows[0]);
  });

  app.put('/api/v1/admin/wanted-posts/:id', async (request, reply) => {
    const{id}=idParam.parse(request.params);const b=z.object({userId:z.coerce.number().int().positive(),categoryId:z.coerce.number().int().positive().nullable().optional(),description:z.string().trim().min(2).max(1000),targetPrice:z.coerce.number().nonnegative().nullable().optional(),quantity:z.string().max(50).nullable().optional(),specText:z.string().max(200).nullable().optional(),regionCode:z.string().max(20).nullable().optional(),status:z.enum(['ACTIVE','FOUND','EXPIRED','OFF_SHELF','VIOLATION'])}).parse(request.body);
    const result=await app.pg.query(`UPDATE wanted_posts SET user_id=$1,category_id=$2,description=$3,target_price=$4,quantity=$5,spec_text=$6,region_code=$7,status=$8,updated_at=NOW() WHERE id=$9 AND deleted_at IS NULL RETURNING *`,[b.userId,b.categoryId??null,b.description,b.targetPrice??null,b.quantity??null,b.specText??null,b.regionCode??null,b.status,id]);if(!result.rows[0])return reply.code(404).send({message:'找货需求不存在'});return result.rows[0];
  });

  app.delete('/api/v1/admin/wanted-posts/:id', async (request, reply) => {const{id}=idParam.parse(request.params);const result=await app.pg.query("UPDATE wanted_posts SET status='DELETED',deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id",[id]);if(!result.rows[0])return reply.code(404).send({message:'找货需求不存在'});return{deleted:true};});

  app.get('/api/v1/admin/reports', async () => ({items:(await app.pg.query(`SELECT r.*,u.nickname AS reporter_name FROM reports r JOIN users u ON u.id=r.reporter_user_id ORDER BY r.id DESC`)).rows}));
  app.patch('/api/v1/admin/reports/:id', async (request, reply) => {const{id}=idParam.parse(request.params);const b=z.object({status:z.enum(['OPEN','PROCESSING','CLOSED']),resolution:z.enum(['NO_VIOLATION','WARNED','CONTENT_REMOVED','USER_LIMITED','USER_BANNED']).nullable().optional()}).parse(request.body);const result=await app.pg.query(`UPDATE reports SET status=$1::varchar,resolution=$2::varchar,handled_at=CASE WHEN $1::varchar='CLOSED' THEN NOW() ELSE handled_at END WHERE id=$3 RETURNING *`,[b.status,b.resolution??null,id]);if(!result.rows[0])return reply.code(404).send({message:'举报不存在'});return result.rows[0];});
  app.delete('/api/v1/admin/reports/:id', async (request, reply) => {const{id}=idParam.parse(request.params);const result=await app.pg.query('DELETE FROM reports WHERE id=$1 RETURNING id',[id]);if(!result.rows[0])return reply.code(404).send({message:'举报不存在'});return{deleted:true};});

  app.get('/api/v1/admin/categories', async () => ({items:(await app.pg.query('SELECT * FROM categories ORDER BY sort_order,id')).rows}));
  app.post('/api/v1/admin/categories', async (request, reply) => {const b=z.object({name:z.string().trim().min(1).max(80),parentId:z.coerce.number().int().positive().nullable().optional(),level:z.coerce.number().int().min(1).max(3).default(1),sortOrder:z.coerce.number().int().default(0),status:z.enum(['ACTIVE','DISABLED']).default('ACTIVE')}).parse(request.body);const result=await app.pg.query('INSERT INTO categories (name,parent_id,level,sort_order,status) VALUES ($1,$2,$3,$4,$5) RETURNING *',[b.name,b.parentId??null,b.level,b.sortOrder,b.status]);return reply.code(201).send(result.rows[0]);});
  app.put('/api/v1/admin/categories/:id', async (request, reply) => {const{id}=idParam.parse(request.params);const b=z.object({name:z.string().trim().min(1).max(80),parentId:z.coerce.number().int().positive().nullable().optional(),level:z.coerce.number().int().min(1).max(3),sortOrder:z.coerce.number().int(),status:z.enum(['ACTIVE','DISABLED'])}).parse(request.body);const result=await app.pg.query('UPDATE categories SET name=$1,parent_id=$2,level=$3,sort_order=$4,status=$5,updated_at=NOW() WHERE id=$6 RETURNING *',[b.name,b.parentId??null,b.level,b.sortOrder,b.status,id]);if(!result.rows[0])return reply.code(404).send({message:'分类不存在'});return result.rows[0];});
  app.delete('/api/v1/admin/categories/:id', async (request, reply) => {const{id}=idParam.parse(request.params);const result=await app.pg.query("UPDATE categories SET status='DISABLED',updated_at=NOW() WHERE id=$1 RETURNING id",[id]);if(!result.rows[0])return reply.code(404).send({message:'分类不存在'});return{deleted:true};});
}
