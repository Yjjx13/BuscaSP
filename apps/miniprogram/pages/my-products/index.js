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
const upload = path => new Promise((resolve, reject) => wx.uploadFile({
  url: app.globalData.apiBaseUrl + '/api/v1/uploads/images', filePath: path, name: 'file',
  header: { Authorization: 'Bearer ' + app.globalData.token },
  success: result => {
    try {
      const data = JSON.parse(result.data);
      result.statusCode < 300 && data.objectKey ? resolve(data) : reject(data);
    } catch (error) { reject(error); }
  }, fail: reject
}));

Page({
  data: { q: '', items: [], allItems: [], recentlyDeletedItems: [], totalCount: 0, publishedCount: 0, offShelfCount: 0, recentlyDeletedCount: 0, activeMetric: 'ALL', loading: false, drawerVisible: false, drawerOpen: false, saving: false, editingId: null, editTitle: '', editPrice: '', editSpec: '', editPiecesPerBox: '', editMinCartons: '1', editImages: [], categoryOptions: [], editCategoryIndex: 0, editCategoryId: null },
  onLoad() { this.loadCategories(); },
  onShow() { this.load(); },
  onUnload() { if (this.drawerTimer) clearTimeout(this.drawerTimer); },
  noop() {},
  onInput(event) { this.setData({ q: event.detail.value }); },
  applyFilters() {
    const query = this.data.q.trim().toLowerCase();
    const source = this.data.activeMetric === 'DELETED' ? this.data.recentlyDeletedItems : this.data.allItems;
    const items = source.filter(item => {
      const matchesQuery = !query || String(item.description || '').toLowerCase().includes(query);
      const matchesStatus = this.data.activeMetric === 'PUBLISHED' ? item.status === 'PUBLISHED' : this.data.activeMetric === 'OFF_SHELF' ? item.status === 'OFF_SHELF' : true;
      return matchesQuery && matchesStatus;
    });
    this.setData({ items });
  },
  chooseMetric(event) {
    this.setData({ activeMetric: event.currentTarget.dataset.metric }, () => this.applyFilters());
  },
  async load() {
    try {
      this.setData({ loading: true });
      await app.ensureLogin();
      const [result, deletedResult] = await Promise.all([request('/api/v1/me/products'), request('/api/v1/me/products/recently-deleted')]);
      const [allItems, recentlyDeletedItems] = await Promise.all([app.localizeProducts(result.items || []), app.localizeProducts(deletedResult.items || [])]);
      this.setData({
        allItems, recentlyDeletedItems, totalCount: allItems.length,
        publishedCount: allItems.filter(item => item.status === 'PUBLISHED').length,
        offShelfCount: allItems.filter(item => item.status === 'OFF_SHELF').length,
        recentlyDeletedCount: recentlyDeletedItems.length
      }, () => this.applyFilters());
    } catch (error) {
      wx.showToast({ title: error.message || '商品查询失败，请稍后重试', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  async loadCategories() {
    try {
      const result = await request('/api/v1/categories/tree');
      const options = [];
      (result.items || []).forEach(first => (first.children || []).forEach(second => (second.children || []).forEach(third => options.push({ id: third.id, path: [first.name, second.name, third.name].join(' / ') }))));
      this.setData({ categoryOptions: options });
    } catch (_) { wx.showToast({ title: '商品分类加载失败', icon: 'none' }); }
  },
  async edit(event) {
    const id = event.currentTarget.dataset.id;
    try {
      await app.ensureLogin();
      const item = await request('/api/v1/me/products/' + id);
      const categoryIndex = Math.max(0, this.data.categoryOptions.findIndex(category => String(category.id) === String(item.category_id)));
      this.setData({
        drawerVisible: true, drawerOpen: false, editingId: item.id, editTitle: item.description || '', editPrice: String(item.price ?? ''), editSpec: item.spec_text || '',
        editPiecesPerBox: String(item.extra_attrs?.piecesPerBox ?? ''), editMinCartons: String(item.extra_attrs?.minCartons ?? 1),
        editImages: (item.images || []).map(image => ({ url: image.object_key, objectKey: image.object_key, thumbKey: image.thumb_key, isNew: false })),
        editCategoryIndex: categoryIndex, editCategoryId: this.data.categoryOptions[categoryIndex]?.id || item.category_id
      }, () => { this.drawerTimer = setTimeout(() => this.setData({ drawerOpen: true }), 20); });
    } catch (error) { wx.showToast({ title: error.message || '商品信息加载失败', icon: 'none' }); }
  },
  closeEdit() {
    this.setData({ drawerOpen: false });
    if (this.drawerTimer) clearTimeout(this.drawerTimer);
    this.drawerTimer = setTimeout(() => this.setData({ drawerVisible: false, editingId: null, editImages: [] }), 260);
  },
  setEditTitle(event) { this.setData({ editTitle: event.detail.value }); },
  setEditPrice(event) { this.setData({ editPrice: event.detail.value }); },
  setEditSpec(event) { this.setData({ editSpec: event.detail.value }); },
  setEditPiecesPerBox(event) { this.setData({ editPiecesPerBox: event.detail.value }); },
  setEditMinCartons(event) { this.setData({ editMinCartons: event.detail.value }); },
  changeEditCategory(event) {
    const editCategoryIndex = Number(event.detail.value);
    this.setData({ editCategoryIndex, editCategoryId: this.data.categoryOptions[editCategoryIndex]?.id || null });
  },
  addEditImages() {
    const remaining = 9 - this.data.editImages.length;
    if (remaining < 1) return wx.showToast({ title: '最多可上传 9 张图片', icon: 'none' });
    wx.chooseMedia({ count: remaining, mediaType: ['image'], success: result => this.setData({ editImages: this.data.editImages.concat(result.tempFiles.map(file => ({ url: file.tempFilePath, isNew: true }))) }) });
  },
  removeEditImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const editImages = this.data.editImages.filter((_, itemIndex) => itemIndex !== index);
    this.setData({ editImages });
  },
  async save(event) {
    const id = this.data.editingId;
    const price = Number(this.data.editPrice);
    const piecesPerBox = Number(this.data.editPiecesPerBox), minCartons = Number(this.data.editMinCartons);
    if (this.data.editTitle.trim().length < 5) return wx.showToast({ title: '商品标题不得少于 5 个字符', icon: 'none' });
    if (!this.data.editCategoryId) return wx.showToast({ title: '请选择三级商品分类', icon: 'none' });
    if (!Number.isFinite(price) || price < 0) return wx.showToast({ title: '请填写有效商品单价', icon: 'none' });
    if (!Number.isInteger(piecesPerBox) || piecesPerBox < 1) return wx.showToast({ title: '装箱数必须是正整数（pcs/cx）', icon: 'none' });
    if (!Number.isInteger(minCartons) || minCartons < 1) return wx.showToast({ title: '最低起订箱数必须是正整数', icon: 'none' });
    if (!this.data.editImages.length) return wx.showToast({ title: '请至少保留 1 张商品图片', icon: 'none' });
    try {
      this.setData({ saving: true }); wx.showLoading({ title: '正在保存' });
      const images = await Promise.all(this.data.editImages.map(async image => image.isNew ? upload(image.url) : { objectKey: image.objectKey, thumbKey: image.thumbKey }));
      await request('/api/v1/products/' + id, 'PUT', { description: this.data.editTitle.trim(), price, priceUnit: 'pc', specText: this.data.editSpec.trim(), categoryId: this.data.editCategoryId, extraAttrs: { piecesPerBox, minCartons }, images });
      wx.hideLoading();
      wx.showToast({ title: '商品信息已保存', icon: 'success' });
      this.closeEdit(); this.load();
    } catch (error) { wx.hideLoading(); wx.showToast({ title: error.message || '保存失败，请稍后重试', icon: 'none' }); }
    finally { this.setData({ saving: false }); }
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
    wx.showModal({ title: '确认删除商品', content: '删除后商品将移入最近删除，可在 15 天内恢复上架；超过 15 天将自动清除。', confirmColor: '#c24156', success: async result => {
      if (!result.confirm) return;
      try { await request('/api/v1/products/' + id, 'DELETE', { action: 'delete' }); wx.showToast({ title: '商品已删除', icon: 'success' }); this.load(); }
      catch (error) { wx.showToast({ title: error.message || '删除失败，请稍后重试', icon: 'none' }); }
    }});
  },
  restore(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({ title: '恢复商品', content: '恢复后商品将重新上架并对外展示。', success: async result => {
      if (!result.confirm) return;
      try { await request('/api/v1/products/' + id + '/restore', 'POST', { action: 'restore' }); wx.showToast({ title: '商品已恢复上架', icon: 'success' }); this.load(); }
      catch (error) { wx.showToast({ title: error.message || '恢复失败，请稍后重试', icon: 'none' }); }
    }});
  }
});
