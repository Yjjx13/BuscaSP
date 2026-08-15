const app = getApp();
Page({
  data: { items: [], loading: false },
  async onShow() {
    try {
      this.setData({ loading: true }); await app.ensureLogin();
      wx.request({ url: app.globalData.apiBaseUrl + '/api/v1/me/favorites', header: { Authorization: 'Bearer ' + app.globalData.token }, success: async result => this.setData({ items: await app.localizeProducts(result.data.items || []) }), fail: () => wx.showToast({ title: '收藏列表加载失败，请稍后重试', icon: 'none' }), complete: () => this.setData({ loading: false }) });
    } catch (_) { this.setData({ loading: false }); }
  },
  detail(event) { wx.navigateTo({ url: '/pages/detail/index?id=' + event.currentTarget.dataset.id }); }
});
