const app = getApp();
Page({
  data: {
    q: '', items: [], loading: false, responseOpen: false, selectedWanted: null,
    responseForm: { productId: null, offerPrice: '', availableQuantity: '', stockType: 'SPOT', expectedAvailableAt: '', message: '' },
    myProductOptions: [{ id: null, label: '不关联商品' }], productIndex: 0, selectedProduct: null,
    today: new Date().toISOString().slice(0, 10), submitting: false
  },
  onShow() { this.load(); },
  onInput(e) { this.setData({ q: e.detail.value }); },
  load() { const q = this.data.q.trim(); this.setData({ loading: true }); wx.request({ url: app.globalData.apiBaseUrl + '/api/v1/wanted-posts' + (q ? '?q=' + encodeURIComponent(q) : ''), success: async r => { const items = (await app.localizeProducts(r.data.items || [])).map(item => ({ ...item, createdLabel: String(item.created_at || '').replace('T', ' ').slice(0, 16) })); this.setData({ items }); this.loadMyResponses(); }, fail: () => wx.showToast({ title: '找货需求加载失败', icon: 'none' }), complete: () => this.setData({ loading: false }) }); },
  async loadMyResponses() {
    try { await app.ensureLogin(); } catch (_) { return; }
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/me/wanted-responses',
      header: { Authorization: 'Bearer ' + app.globalData.token },
      success: response => {
        if (response.statusCode >= 300) return;
        const responseMap = {};
        (response.data.items || []).forEach(item => { responseMap[String(item.wanted_post_id)] = item; });
        this.setData({ items: this.data.items.map(item => ({ ...item, has_responded: Boolean(responseMap[String(item.id)]), my_response: responseMap[String(item.id)] || null })) });
      }
    });
  },
  create() { wx.navigateTo({ url: '/pages/wanted-create/index' }); },
  openDetail(e) { wx.navigateTo({ url: '/pages/wanted-detail/index?id=' + e.currentTarget.dataset.id }); },
  async respond(e) {
    try { await app.ensureLogin(); } catch (_) { return; }
    await this.loadMyProducts();
    const selectedWanted = this.data.items.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    const existing = selectedWanted.my_response;
    const productIndex = existing && existing.product_id
      ? Math.max(0, this.data.myProductOptions.findIndex(item => String(item.id) === String(existing.product_id))) : 0;
    this.setData({
      responseOpen: true,
      selectedWanted,
      productIndex,
      selectedProduct: this.data.myProductOptions[productIndex].product || null,
      responseForm: {
        productId: this.data.myProductOptions[productIndex].id,
        offerPrice: existing && existing.offer_price != null ? String(existing.offer_price) : '',
        availableQuantity: existing ? existing.available_quantity || '' : '',
        stockType: existing ? existing.stock_type || 'SPOT' : 'SPOT',
        expectedAvailableAt: existing && existing.expected_available_at ? String(existing.expected_available_at).slice(0, 10) : '',
        message: existing ? existing.message || '' : ''
      }
    });
  },
  loadMyProducts() {
    return new Promise(resolve => wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/me/products?status=PUBLISHED',
      header: { Authorization: 'Bearer ' + app.globalData.token },
      success: async response => {
        if (response.statusCode >= 300) return resolve();
        const products = await app.localizeProducts(response.data.items || []);
        this.setData({ myProductOptions: [{ id: null, label: '不关联商品', product: null }, ...products.map(product => ({ id: product.id, label: product.description, product }))] });
        resolve();
      },
      fail: resolve
    }));
  },
  closeResponse() { if (!this.data.submitting) this.setData({ responseOpen: false }); },
  stopBubble() {},
  onResponseInput(e) { this.setData({ ['responseForm.' + e.currentTarget.dataset.field]: e.detail.value }); },
  onProductChange(e) {
    const productIndex = Number(e.detail.value);
    const option = this.data.myProductOptions[productIndex];
    this.setData({ productIndex, selectedProduct: option.product || null, 'responseForm.productId': option.id || null });
  },
  chooseStockType(e) {
    const stockType = e.currentTarget.dataset.type;
    this.setData({ 'responseForm.stockType': stockType, 'responseForm.expectedAvailableAt': stockType === 'SPOT' ? '' : this.data.responseForm.expectedAvailableAt });
  },
  onExpectedDateChange(e) { this.setData({ 'responseForm.expectedAvailableAt': e.detail.value }); },
  submitResponse() {
    const form = this.data.responseForm;
    if (!form.availableQuantity.trim()) return wx.showToast({ title: '请填写可供数量', icon: 'none' });
    const offerPrice = form.offerPrice.trim();
    if (!offerPrice || !Number.isFinite(Number(offerPrice)) || Number(offerPrice) < 0) return wx.showToast({ title: '请填写正确的商品单价', icon: 'none' });
    if (form.stockType === 'PRESALE' && !form.expectedAvailableAt) return wx.showToast({ title: '请选择预计可交货日期', icon: 'none' });
    this.setData({ submitting: true });
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/wanted-posts/' + this.data.selectedWanted.id + '/responses',
      method: 'POST',
      header: { Authorization: 'Bearer ' + app.globalData.token },
      data: {
        productId: form.productId || undefined,
        offerPrice: Number(offerPrice),
        availableQuantity: form.availableQuantity.trim(),
        stockType: form.stockType,
        expectedAvailableAt: form.stockType === 'PRESALE' ? form.expectedAvailableAt : undefined,
        message: form.message.trim() || undefined
      },
      success: response => {
        if (response.statusCode >= 300) return wx.showToast({ title: response.data.message || '提交供货响应失败', icon: 'none' });
        this.setData({ responseOpen: false });
        this.loadMyResponses();
        wx.showModal({ title: this.data.selectedWanted.has_responded ? '新一轮报价已提交' : '供货响应已提交', content: '找货方可以在“我的找货需求”中查看完整报价记录。请确认已在“我的”页面设置联系方式。', showCancel: false });
      },
      fail: () => wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' }),
      complete: () => this.setData({ submitting: false })
    });
  }
});
