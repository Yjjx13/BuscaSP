import assert from 'node:assert/strict';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { db } from '../src/db.js';

const base = 'http://127.0.0.1:3000';
const marker = 'loop_' + Date.now();
const accounts: { id: number; token: string }[] = [];
const checks: string[] = [];
let uploaded = '';
const call = async (actor: number | null, method: string, path: string, body?: unknown, expected = 200) => {
  const response = await fetch(base + path, {
    method, headers: { ...(actor === null ? {} : { Authorization: 'Bearer ' + accounts[actor].token }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000)
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
};
const pass = (name: string) => { checks.push(name); console.log('PASS ' + name); };
let failure = '';
try {
  await call(null, 'GET', '/health');
  for (let n = 0; n < 3; n++) {
    const login = await call(null, 'POST', '/api/v1/auth/dev-login', { openid: marker + '_' + n, nickname: marker + '_' + n });
    accounts.push({ id: Number(login.user.id), token: login.token });
  }
  pass('三个独立账号通过本地登录接口登录');
  await call(1, 'PUT', '/api/v1/me/contacts', { contactType: 'WECHAT', value: 'loop_supplier' });
  const form = new FormData();
  form.append('file', new Blob([await readFile(join(process.cwd(), 'uploads/screenshot-diamond-cups.png'))], { type: 'image/png' }), 'glass-cups.png');
  const upload = await fetch(base + '/api/v1/uploads/images', { method: 'POST', headers: { Authorization: 'Bearer ' + accounts[1].token }, body: form });
  assert.equal(upload.status, 201); const image = await upload.json();
  uploaded = basename(new URL(image.objectKey).pathname);
  assert.equal((await fetch(image.objectKey)).status, 200); pass('真实商品图片上传并可读取');
  const tree = await call(null, 'GET', '/api/v1/categories/tree');
  const leaf = tree.items.flatMap((a: any) => a.children).flatMap((b: any) => b.children)[0]; assert.ok(leaf);
  const payload = { description: marker + '透明玻璃杯六件套', categoryId: Number(leaf.id), price: 12.5, priceType: 'FIXED', priceUnit: 'pc', extraAttrs: { piecesPerBox: 24, minCartons: 1 }, images: [{ objectKey: image.objectKey }] };
  const product = await call(1, 'POST', '/api/v1/products', payload, 201); const pid = product.id;
  pass('发布商品并保存单价装箱数与分类');
  const list = await call(null, 'GET', '/api/v1/products?q=' + marker);
  assert.ok(list.items.some((p: any) => p.id === pid));
  const categoryList = await call(null, 'GET', '/api/v1/products?categoryId=' + leaf.id + '&q=' + marker);
  assert.ok(categoryList.items.some((p: any) => p.id === pid));
  const detail = await call(0, 'GET', '/api/v1/products/' + pid);
  assert.equal(Number(detail.extra_attrs.piecesPerBox), 24); pass('搜索分类与详情读取一致');
  await call(0, 'PUT', `/api/v1/products/${pid}/favorite`);
  assert.ok((await call(0, 'GET', '/api/v1/me/favorites')).items.some((p: any) => p.id === pid));
  assert.equal((await call(0, 'POST', `/api/v1/products/${pid}/contact`, {})).value, 'loop_supplier');
  pass('买家收藏商品并取得商家联系方式');
  await call(2, 'PUT', '/api/v1/products/' + pid, { description: payload.description, price: 9 }, 404);
  await call(1, 'PUT', '/api/v1/products/' + pid, { description: payload.description, price: 11.5, categoryId: Number(leaf.id), images: payload.images });
  assert.equal(Number((await call(0, 'GET', '/api/v1/products/' + pid)).price), 11.5); pass('本人编辑生效且他人不可编辑');
  await call(1, 'POST', `/api/v1/products/${pid}/status`, { status: 'OFF_SHELF' });
  assert.equal((await call(null, 'GET', '/api/v1/products?q=' + marker)).items.length, 0);
  await call(1, 'POST', `/api/v1/products/${pid}/status`, { status: 'PUBLISHED' });
  await call(1, 'DELETE', '/api/v1/products/' + pid);
  assert.ok((await call(1, 'GET', '/api/v1/me/products/recently-deleted')).items.some((p: any) => p.id === pid));
  await call(1, 'POST', `/api/v1/products/${pid}/restore`, {});
  assert.equal((await call(null, 'GET', '/api/v1/products?q=' + marker)).items.length, 1); pass('下架删除与恢复闭环');
  const demandBody = { description: marker + '需要透明玻璃杯', imageKeys: [image.objectKey], quantity: '48件' };
  await call(0, 'POST', '/api/v1/wanted-posts', { ...demandBody, imageKeys: [] }, 400);
  const demand = await call(0, 'POST', '/api/v1/wanted-posts', demandBody, 201); const wid = demand.id;
  assert.equal((await call(null, 'GET', '/api/v1/wanted-posts?q=' + marker)).items.length, 1); pass('需求必填校验与市场展示');
  const offer = { offerPrice: 11.5, availableQuantity: '48件', stockType: 'SPOT', productId: Number(pid) };
  await call(0, 'POST', `/api/v1/wanted-posts/${wid}/responses`, offer, 400);
  await call(2, 'POST', `/api/v1/wanted-posts/${wid}/responses`, offer, 400);
  const response = await call(1, 'POST', `/api/v1/wanted-posts/${wid}/responses`, offer, 201); const rid = response.id;
  await call(2, 'POST', `/api/v1/wanted-posts/${wid}/responses`, { offerPrice: 10, availableQuantity: '48件', stockType: 'PRESALE' }, 400);
  const other = await call(2, 'POST', `/api/v1/wanted-posts/${wid}/responses`, { offerPrice: 10, availableQuantity: '48件', stockType: 'PRESALE', expectedAvailableAt: '2026-12-01' }, 201);
  pass('现货关联本人商品预售交期校验与禁止自报价');
  let mine = await call(0, 'GET', '/api/v1/me/wanted-posts');
  assert.equal(Number(mine.items.find((w: any) => w.id === wid).unread_response_count), 2);
  await call(0, 'GET', `/api/v1/me/wanted-posts/${wid}/responses`);
  mine = await call(0, 'GET', '/api/v1/me/wanted-posts');
  assert.equal(Number(mine.items.find((w: any) => w.id === wid).unread_response_count), 0); pass('收到新报价提示与读取后清零');
  await call(0, 'POST', `/api/v1/wanted-responses/${rid}/offers`, { offerPrice: 9, availableQuantity: '48件', stockType: 'SPOT' }, 201);
  assert.equal(Number((await call(1, 'GET', '/api/v1/me/wanted-responses')).items[0].supplier_price), 11.5);
  await call(1, 'POST', `/api/v1/wanted-responses/${rid}/offers`, { offerPrice: 10.5, availableQuantity: '48件', stockType: 'SPOT' }, 201);
  assert.equal(Number((await call(1, 'GET', '/api/v1/me/wanted-responses')).items[0].supplier_price), 10.5);
  const rounds = await call(0, 'GET', `/api/v1/me/wanted-posts/${wid}/responses`);
  assert.equal(rounds.items.find((r: any) => r.id === rid).offers.length, 3); pass('三轮报价保留且商家价格不被买家还价覆盖');
  await call(2, 'GET', `/api/v1/wanted-responses/${rid}`, undefined, 404);
  await call(2, 'PATCH', `/api/v1/wanted-responses/${rid}`, { status: 'ACCEPTED' }, 404); pass('他人无法查看或采纳其他商家的私人报价');
  await call(0, 'POST', `/api/v1/wanted-responses/${rid}/contact`, {});
  assert.equal((await call(0, 'GET', '/api/v1/wanted-posts/' + wid)).status, 'ACTIVE'); pass('联系商家不关闭需求');
  await call(0, 'PATCH', `/api/v1/wanted-responses/${other.id}`, { status: 'REJECTED' });
  await call(0, 'PATCH', `/api/v1/wanted-responses/${rid}`, { status: 'ACCEPTED' });
  assert.equal((await call(null, 'GET', '/api/v1/wanted-posts?q=' + marker)).items.length, 0);
  await call(1, 'POST', `/api/v1/wanted-posts/${wid}/responses`, offer, 409);
  assert.equal((await call(0, 'GET', `/api/v1/me/wanted-posts/${wid}/responses`)).items.find((r: any) => r.id === rid).offers.length, 3);
  pass('标记不合适选择货源结束市场展示并保留历史');
} catch (e) { failure = e instanceof Error ? e.message : String(e); console.error(failure); process.exitCode = 1; }
finally {
  const ids = accounts.map(a => a.id);
  if (ids.length) {
    await db.query('DELETE FROM wanted_posts WHERE user_id=ANY($1::bigint[])', [ids]);
    await db.query('DELETE FROM products WHERE user_id=ANY($1::bigint[])', [ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::bigint[]) AND wechat_openid LIKE $2', [ids, marker + '%']);
  }
  if (uploaded) await unlink(join(process.cwd(), 'uploads', uploaded));
  await db.end();
  await writeFile(join(process.cwd(), '../../docs/闭环数据测试结果.md'), '# 闭环数据测试结果\n\n运行时间：' + new Date().toISOString() + '\n\n通过 ' + checks.length + ' 组实际 HTTP 接口检查。\n\n' + checks.map(x => '- 通过：' + x).join('\n') + '\n\n' + (failure ? '未通过：' + failure : '本轮接口检查全部通过。') + '\n\n测试通过本地开发登录建立三个独立账号，图片实际上传。仅删除本次测试生成的账号、商品、需求、报价、联系记录与图片，原有业务数据未修改。此结果不等同于微信真机触摸交互、消息推送或实际线下成交验证。\n');
}
