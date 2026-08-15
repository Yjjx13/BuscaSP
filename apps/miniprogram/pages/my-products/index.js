const app = getApp();

function request(path, method = 'GET', data) {
  return new Promise((resolve, reject) => wx.request({
    url: app.globalData.apiBaseUrl + path,
    method,
    data,
    header: { Authorization: 'Bearer ' + app.globalData.token },
    success: result => result.statusCode < 300 ? resolve(result.data) : reject(result.data || {}),
    fail: error => reject({ message: error.errMsg || '网络请求失败' })
  }));
}

Page({
  data: { q: '', items: [], loading: false, editingId: null, editTitle: '', editPrice: '', editSpec: '' },
  onShow() { this.load(); },
  onInput(event) { this.setData({ q: event.detail.value }); },
  async load() {
    try {
      this.setData({ loading: true });
      await app.ensureLogin();
      const query = this.data.q.trim();
      const result = await request('/api/v1/me/products' + (query ? '?q=' + encodeURIComponent(query) : ''));
      this.setData({ items: await app.localizeProducts(result.items || []) });
    } catch (error) {
      wx.showToast({ title: error.message || '商品查询失败，请稍后重试', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  edit(event) {
    const item = this.data.items.find(product => product.id === event.currentTarget.dataset.id);
    if (!item) return;
    this.setData({ editingId: item.id, editTitle: item.description, editPrice: String(item.price ?? ''), editSpec: item.spec_text || '' });
  },
  cancelEdit() { this.setData({ editingId: null }); },
  setEditTitle(event) { this.setData({ editTitle: event.detail.value }); },
  setEditPrice(event) { this.setData({ editPrice: event.detail.value }); },
  setEditSpec(event) { this.setData({ editSpec: event.detail.value }); },
  async save(event) {
    const id = event.currentTarget.dataset.id;
    const price = Number(this.data.editPrice);
    if (this.data.editTitle.trim().length < 5 || !Number.isFinite(price) || price < 0) return wx.showToast({ title: '请填写有效商品标题和单价', icon: 'none' });
    try {
      await request('/api/v1/products/' + id, 'PUT', { description: this.data.editTitle.trim(), price, priceUnit: 'pc', specText: this.data.editSpec.trim() });
      wx.showToast({ title: '商品信息已保存', icon: 'success' });
      this.setData({ editingId: null }); this.load();
    } catch (error) { wx.showToast({ title: error.message || '保存失败，请稍后重试', icon: 'none' }); }
  },
  async toggleStatus(event) {
    const { id, status } = event.currentTarget.dataset;
    const nextStatus = status === 'PUBLISHED' ? 'OFF_SHELF' : 'PUBLISHED';
    try {
      await request('/api/v1/products/' + id + '/status', 'POST', { status: nextStatus });
      wx.showToast({ title: nextStatus === 'PUBLISHED' ? '商品已上架' : '商品已下架', icon: 'success' }); this.load();
    } catch (error) { wx.showToast({ title: error.message || '操作失败，请稍后重试', icon: 'none' }); }
  },
  remove(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({ title: '确认删除商品', content: '删除后商品将不再对外展示，且无法在小程序中恢复。', confirmColor: '#c24156', success: async result => {
      if (!result.confirm) return;
      try { await request('/api/v1/products/' + id, 'DELETE'); wx.showToast({ title: '商品已删除', icon: 'success' }); this.load(); }
      catch (error) { wx.showToast({ title: error.message || '删除失败，请稍后重试', icon: 'none' }); }
    }});
  }
});
