const app = getApp();
const blockedWords = ['海量出货', '大量出货', '清仓出货', '111', '1111', 'test', '测试商品', '联系我', '私聊', '有货', '便宜出'];
const upload = path => new Promise((resolve, reject) => wx.uploadFile({
  url: app.globalData.apiBaseUrl + '/api/v1/uploads/images', filePath: path, name: 'file',
  header: { Authorization: 'Bearer ' + app.globalData.token },
  success: result => { try { resolve(JSON.parse(result.data)); } catch (error) { reject(error); } }, fail: reject
}));
function descriptionError(value) {
  const text = (value || '').replace(/\s+/g, '');
  if (text.length < 5) return '商品标题不得少于5个字符，并应注明具体商品名称';
  if (blockedWords.some(word => text.toLowerCase().includes(word))) return '商品标题不得包含泛化营销用语或无意义内容';
  if (/^(.)\1{4,}$/.test(text) || /^[\d\W_]+$/.test(text)) return '商品标题不得仅由数字、符号或重复字符组成';
  return '';
}
Page({
  data: { images: [], description: '', descriptionError: '', unitPrice: '', piecesPerBox: '', minCartons: '1', specText: '', submitting: false, categoryTree: [], categoryRange: [[], [], []], categoryIndexes: [0, 0, 0], categoryId: null, categoryPath: '' },
  onLoad() { this.loadCategories(); },
  loadCategories() {
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/categories/tree',
      success: response => {
        const categoryTree = response.data.items || [];
        this.setData({ categoryTree, ...this.categoryColumns(categoryTree, [0, 0, 0]) });
      },
      fail: () => wx.showToast({ title: '商品分类加载失败，请稍后重试', icon: 'none' })
    });
  },
  categoryColumns(tree, indexes) {
    const first = tree || [];
    const firstIndex = Math.min(indexes[0] || 0, Math.max(first.length - 1, 0));
    const second = first[firstIndex]?.children || [];
    const secondIndex = Math.min(indexes[1] || 0, Math.max(second.length - 1, 0));
    const third = second[secondIndex]?.children || [];
    const thirdIndex = Math.min(indexes[2] || 0, Math.max(third.length - 1, 0));
    return { categoryRange: [first, second, third], categoryIndexes: [firstIndex, secondIndex, thirdIndex] };
  },
  changeCategoryColumn(event) {
    const indexes = [...this.data.categoryIndexes];
    const column = event.detail.column;
    indexes[column] = event.detail.value;
    if (column < 1) indexes[1] = 0;
    if (column < 2) indexes[2] = 0;
    this.setData(this.categoryColumns(this.data.categoryTree, indexes));
  },
  confirmCategory(event) {
    const columns = this.categoryColumns(this.data.categoryTree, event.detail.value);
    const [firstIndex, secondIndex, thirdIndex] = columns.categoryIndexes;
    const first = columns.categoryRange[0][firstIndex];
    const second = columns.categoryRange[1][secondIndex];
    const third = columns.categoryRange[2][thirdIndex];
    const selected = third || second || first;
    this.setData({ ...columns, categoryId: selected?.id || null, categoryPath: [first?.name, second?.name, third?.name].filter(Boolean).join(' / ') });
  },
  chooseImage() { wx.chooseMedia({ count: 9 - this.data.images.length, mediaType: ['image'], success: result => this.setData({ images: this.data.images.concat(result.tempFiles.map(file => file.tempFilePath)) }) }); },
  setDescription(event) { const description = event.detail.value; this.setData({ description, descriptionError: descriptionError(description) }); },
  setUnitPrice(event) { this.setData({ unitPrice: event.detail.value }); },
  setPiecesPerBox(event) { this.setData({ piecesPerBox: event.detail.value }); },
  setMinCartons(event) { this.setData({ minCartons: event.detail.value }); },
  setSpec(event) { this.setData({ specText: event.detail.value }); },
  async submit() {
    const error = descriptionError(this.data.description);
    const unitPrice = Number(this.data.unitPrice), piecesPerBox = Number(this.data.piecesPerBox), minCartons = Number(this.data.minCartons);
    if (!this.data.categoryId) return wx.showToast({ title: '请选择商品所属分类', icon: 'none' });
    if (!this.data.images.length || error || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isInteger(piecesPerBox) || piecesPerBox < 1 || !Number.isInteger(minCartons) || minCartons < 1) { this.setData({ descriptionError: error }); return wx.showToast({ title: error || '请完整填写单价、装箱数量及最低起订箱数', icon: 'none' }); }
    try { await app.ensureLogin(); } catch (_) { return; }
    this.setData({ submitting: true }); wx.showLoading({ title: '正在发布' });
    try {
      const images = await Promise.all(this.data.images.map(upload));
      await new Promise((resolve, reject) => wx.request({ url: app.globalData.apiBaseUrl + '/api/v1/products', method: 'POST', header: { Authorization: 'Bearer ' + app.globalData.token }, data: { categoryId: this.data.categoryId, description: this.data.description, priceType: 'FIXED', price: unitPrice, priceUnit: 'pc', specText: this.data.specText, extraAttrs: { piecesPerBox, minCartons }, images }, success: result => result.statusCode === 201 ? resolve(result.data) : reject(result.data), fail: reject }));
      wx.hideLoading(); wx.showToast({ title: '发布成功' }); setTimeout(() => wx.switchTab({ url: '/pages/home/index' }), 700);
    } catch (error) { wx.hideLoading(); wx.showToast({ title: error.message || '发布失败，请核对商品信息后重试', icon: 'none' }); } finally { this.setData({ submitting: false }); }
  }
});
