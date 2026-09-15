const app = getApp();
const upload = path => new Promise((resolve, reject) => wx.uploadFile({
  url: app.globalData.apiBaseUrl + '/api/v1/uploads/images', filePath: path, name: 'file',
  header: { Authorization: 'Bearer ' + app.globalData.token },
  success: r => { try { const data = JSON.parse(r.data); r.statusCode < 300 && data.objectKey ? resolve(data.objectKey) : reject(data); } catch(e) { reject(e); } }, fail: reject
}));
Page({
  data: { moreOpen: false, images: [], description: '', targetPrice: '', quantity: '', specText: '', submitting: false },
  onLoad(query) { if (query.q) this.setData({ description: query.q }); },
  toggleMore() { this.setData({ moreOpen: !this.data.moreOpen }); },
  chooseImage() { wx.chooseMedia({ count: 9 - this.data.images.length, mediaType: ['image'], success: r => this.setData({ images: this.data.images.concat(r.tempFiles.map(f => f.tempFilePath)) }) }); },
  setDescription(e) { this.setData({ description: e.detail.value }); },
  setPrice(e) { this.setData({ targetPrice: e.detail.value }); },
  setQuantity(e) { this.setData({ quantity: e.detail.value }); },
  setSpec(e) { this.setData({ specText: e.detail.value }); },
  async submit() {
    if (this.data.submitting) return;
    if (!this.data.images.length) return wx.showToast({ title: '请至少上传1张需求图片', icon: 'none' });
    if (this.data.description.trim().length < 2) return wx.showToast({ title: '请填写具体需求说明', icon: 'none' });
    if (!this.data.quantity.trim()) return wx.showToast({ title: '请填写所需数量及单位', icon: 'none' });
    const priceText = this.data.targetPrice.trim();
    if (priceText && (!Number.isFinite(Number(priceText)) || Number(priceText) < 0)) return wx.showToast({ title: '请填写有效目标单价', icon: 'none' });
    this.setData({ submitting: true });
    try {
      await app.ensureLogin();
      wx.showLoading({ title: '正在发布' });
      const imageKeys = await Promise.all(this.data.images.map(upload));
      const created = await new Promise((resolve, reject) => wx.request({
        url: app.globalData.apiBaseUrl + '/api/v1/wanted-posts', method: 'POST',
        header: { Authorization: 'Bearer ' + app.globalData.token },
        data: { description: this.data.description.trim(), imageKeys, targetPrice: priceText ? Number(priceText) : undefined, quantity: this.data.quantity.trim(), specText: this.data.specText.trim() || undefined },
        success: r => r.statusCode === 201 ? resolve(r.data) : reject(r.data), fail: reject
      }));
      wx.hideLoading();
      wx.showModal({ title: '需求发布成功', content: '收到报价后，可在“我的 → 我的需求”查看。需求有效期为7天。', showCancel: false,
        success: () => wx.redirectTo({ url: '/pages/wanted-detail/index?id=' + created.id }) });
    } catch(e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '发布失败，已保留填写内容', icon: 'none' });
    } finally { this.setData({ submitting: false }); }
  }
});
