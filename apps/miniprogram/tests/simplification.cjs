const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const { summarizeOffers } = require('../utils/quote-summary');
const summary = summarizeOffers([
  { id: 3, created_at: '2026-09-12', sender_role: 'BUYER', offer_price: 8 },
  { id: 1, created_at: '2026-09-11', sender_role: 'SUPPLIER', offer_price: 12 },
  { id: 2, created_at: '2026-09-12', sender_role: 'SUPPLIER', offer_price: 10 }
]);
assert.equal(summary.latestSupplier.offer_price, 10);
assert.equal(summary.latestBuyer.offer_price, 8);
assert.equal(summarizeOffers([]).latestSupplier, null);
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const tabs = new Set(config.tabBar.list.map(t => '/' + t.pagePath));
assert.equal(tabs.size, 4);
for (const route of config.pages) {
  for (const ext of ['.js', '.wxml', '.json', '.wxss']) assert.ok(fs.existsSync(path.join(root, route + ext)), route + ext);
  const source = fs.readFileSync(path.join(root, route + '.js'), 'utf8');
  new vm.Script(source, { filename: route });
  let definition;
  vm.runInNewContext(source, { Page: x => definition = x, getApp: () => ({}), require: createRequire(path.join(root, route + '.js')), wx: {}, setTimeout, clearTimeout });
  const template = fs.readFileSync(path.join(root, route + '.wxml'), 'utf8');
  for (const match of template.matchAll(/(?:bind|catch):?[a-z]+="([A-Za-z_$][\w$]*)"/g)) {
    assert.equal(typeof definition[match[1]], 'function', route + ': missing event ' + match[1]);
  }
  for (const match of source.matchAll(/wx\.(switchTab|navigateTo|redirectTo)\(\{\s*url:\s*['"]([^'"?]+)['"]/g)) {
    assert.equal(tabs.has(match[2]), match[1] === 'switchTab', route + ': wrong navigation to ' + match[2]);
  }
}
let page;
vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/product-create/index.js'), 'utf8'), {
  Page: x => page = x, getApp: () => ({}), wx: { showToast: x => { assert.equal(x.title, '请填写有效商品单价'); } }
});
page.data = { ...page.data, images: ['photo'], description: '透明玻璃水杯套装', categoryId: 1, unitPrice: '', piecesPerBox: '24', minCartons: '1' };
page.submit();
console.log('PASS quote separation, empty price guard, page files and navigation checks');
