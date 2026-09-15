const app = getApp();

function apiRequest(options) {
  return new Promise((resolve, reject) => wx.request({
    ...options,
    success: response => response.statusCode < 300 ? resolve(response.data) : reject(response.data || {}),
    fail: error => reject({ message: error.errMsg || '网络请求失败' })
  }));
}

function withBoxCount(product) {
  const rawCount = product?.extra_attrs?.piecesPerBox ?? product?.quantity;
  const numericCount = Number(rawCount);
  return {
    ...product,
    box_count: Number.isInteger(numericCount) ? String(numericCount) : (rawCount ?? '')
  };
}

Page({
  data: {
    product: null,
    contact: null,
    loading: true,
    imageLoading: true,
    loadFailed: false,
    actionsReady: false,
    activeImage: 1,
    related: []
  },

  onLoad(query) {
    this.productId = query.id;
    this.loadProduct();
    this.loadRelated();
  },

  onUnload() {
    this.pageClosed = true;
    if (this.actionsTimer) clearTimeout(this.actionsTimer);
  },

  loadProduct() {
    this.setData({ loading: true, imageLoading: true, loadFailed: false, actionsReady: false });
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/products/' + this.productId,
      success: async response => {
        if (response.statusCode >= 300 || !response.data) return this.showLoadError();
        const rawProduct = withBoxCount(response.data);
        // 先呈现报价和文字信息，图片在后台转换为本地临时文件。
        this.setData({ product: { ...rawProduct, images: [] }, loading: false });
        this.actionsTimer = setTimeout(() => {
          if (!this.pageClosed) this.setData({ actionsReady: true });
        }, 120);
        const localized = withBoxCount((await app.localizeProducts([rawProduct]))[0]);
        if (!this.pageClosed) this.setData({ product: localized, imageLoading: false });
      },
      fail: () => this.showLoadError()
    });
  },

  loadRelated() {
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/products/' + this.productId + '/related',
      success: async response => {
        if (response.statusCode < 300) this.setData({ related: await app.localizeProducts(response.data.items || []) });
      }
    });
  },

  openRelated(event) {
    wx.redirectTo({ url: '/pages/detail/index?id=' + event.currentTarget.dataset.id });
  },

  showLoadError() {
    this.setData({ loading: false, imageLoading: false, loadFailed: true });
  },

  onSwiperChange(event) {
    this.setData({ activeImage: event.detail.current + 1 });
  },

  async favorite() {
    try { await app.ensureLogin(); } catch (_) { return; }
    try {
      await apiRequest({
        url: app.globalData.apiBaseUrl + '/api/v1/products/' + this.data.product.id + '/favorite',
        method: 'PUT', header: { Authorization: 'Bearer ' + app.globalData.token }, data: {}
      });
      wx.showToast({ title: '已收藏', icon: 'success' });
    } catch (_) {
      wx.showToast({ title: '收藏失败，请稍后重试', icon: 'none' });
    }
  },

  async contact() {
    try { await app.ensureLogin(); } catch (_) { return; }
    try {
      const contact = await apiRequest({
        url: app.globalData.apiBaseUrl + '/api/v1/products/' + this.data.product.id + '/contact',
        method: 'POST', header: { Authorization: 'Bearer ' + app.globalData.token }, data: {}
      });
      this.setData({ contact });
      this.showContactActions(contact);
    } catch (error) {
      wx.showToast({ title: error.message || '暂时无法获取商家联系方式', icon: 'none' });
    }
  },

  showContactActions(contact) {
    const label = contact.contactType === 'WECHAT' ? '微信号' : '联系电话';
    wx.showModal({
      title: contact.publisher + '的' + label,
      content: contact.value,
      confirmText: '复制联系方式',
      cancelText: '已添加好友',
      success: result => {
        if (result.confirm) this.copyContact();
        if (result.cancel) wx.showToast({ title: '请返回微信聊天列表联系商家', icon: 'none' });
      }
    });
  },

  copyContact() {
    const contact = this.data.contact;
    if (!contact) return;
    wx.setClipboardData({
      data: contact.value,
      success: () => wx.showModal({
        title: '联系方式已复制',
        content: contact.contactType === 'WECHAT'
          ? '请返回微信，通过“添加朋友”粘贴微信号添加商家；如已是好友，可直接在聊天列表中联系。'
          : '请在微信或电话应用中粘贴或拨打该号码联系商家。',
        showCancel: false,
        confirmText: '知道了'
      })
    });
  }
});
