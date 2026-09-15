import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { db } from '../src/db.js';
import { wantedRoutes } from '../src/routes/wanted.js';
import { encrypt } from '../src/crypto.js';

// Only this run's temporary users and demands are removed in finally.
const app = Fastify();
app.decorate('pg', db);
await app.register(jwt, { secret: 'isolated-test-signing-key' });
await wantedRoutes(app);
const ids: number[] = [];
const marker = 'simplify_' + Date.now();
let checks = 0;
try {
  for (let n = 0; n < 3; n++) ids.push(Number((await db.query('INSERT INTO users (wechat_openid,nickname) VALUES ($1,$2) RETURNING id', [marker + n, marker + n])).rows[0].id));
  const [buyer, supplier, stranger] = ids;
  const call = (user: number, method: any, url: string, payload?: any) => app.inject({ method, url, ...(payload === undefined ? {} : { payload }), headers: { authorization: 'Bearer ' + app.jwt.sign({ sub: String(user) }) } });
  const demand = await call(buyer, 'POST', '/api/v1/wanted-posts', { description: marker + ' 玻璃杯采购', imageKeys: ['/uploads/test-only.png'], quantity: '24件' });
  assert.equal(demand.statusCode, 201); checks++;
  const wid = demand.json().id;
  const quote = await call(supplier, 'POST', `/api/v1/wanted-posts/${wid}/responses`, { offerPrice: 10, availableQuantity: '24件', stockType: 'SPOT' });
  assert.equal(quote.statusCode, 201); checks++;
  const rid = quote.json().id;
  assert.equal((await call(buyer, 'POST', `/api/v1/wanted-responses/${rid}/offers`, { offerPrice: 8, availableQuantity: '24件', stockType: 'SPOT' })).statusCode, 201); checks++;
  const own = (await call(supplier, 'GET', '/api/v1/me/wanted-responses')).json().items;
  assert.equal(own.length, 1); assert.equal(Number(own[0].supplier_price), 10); assert.equal(own[0].wanted_description, marker + ' 玻璃杯采购'); checks++;
  assert.equal((await call(stranger, 'GET', '/api/v1/me/wanted-responses')).json().items.length, 0); checks++;
  assert.equal((await call(stranger, 'PATCH', `/api/v1/wanted-responses/${rid}`, { status: 'ACCEPTED' })).statusCode, 404); checks++;
  await db.query('INSERT INTO user_contacts(user_id,contact_type,value_cipher,masked_value) VALUES ($1,$2,$3,$4)', [supplier, 'WECHAT', encrypt('test-contact-only'), 'test***']);
  assert.equal((await call(buyer, 'POST', `/api/v1/wanted-responses/${rid}/contact`, {})).statusCode, 200);
  assert.equal((await db.query('SELECT status FROM wanted_posts WHERE id=$1', [wid])).rows[0].status, 'ACTIVE'); checks++;
  assert.equal((await call(buyer, 'PATCH', `/api/v1/wanted-responses/${rid}`, { status: 'ACCEPTED' })).statusCode, 200); checks++;
  assert.equal((await db.query('SELECT status FROM wanted_posts WHERE id=$1', [wid])).rows[0].status, 'FOUND');
  assert.equal((await call(buyer, 'GET', '/api/v1/wanted-posts?q=' + marker)).json().items.length, 0); checks++;
  assert.equal((await call(buyer, 'PATCH', `/api/v1/wanted-responses/${rid}`, { status: 'ACCEPTED' })).statusCode, 409); checks++;
  assert.equal((await call(supplier, 'POST', `/api/v1/wanted-responses/${rid}/offers`, { offerPrice: 9, availableQuantity: '24件', stockType: 'SPOT' })).statusCode, 404); checks++;
  const history = await call(buyer, 'GET', `/api/v1/me/wanted-posts/${wid}/responses`);
  assert.equal(history.json().items[0].offers.length, 2); checks++;
  console.log(`PASS ${checks} real-database workflow checks`);
} finally {
  if (ids.length) {
    await db.query('DELETE FROM wanted_posts WHERE user_id=ANY($1::bigint[])', [ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::bigint[]) AND wechat_openid LIKE $2', [ids, marker + '%']);
  }
  await app.close(); await db.end();
}
