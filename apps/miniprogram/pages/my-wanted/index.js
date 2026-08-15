const app = getApp();
Page({
  data: { items: [], loading: false },
  async onShow() {
    try {
      this.setData({ loading: true }); await app.ensureLogin();
      wx.request({ url: app.globalData.apiBaseUrl + '/api/v1/me/wanted-posts', header: { Authorization: 'Bearer ' + app.globalData.token }, success: result => this.setData({ items: result.data.items || [] }), fail: () => wx.showToast({ title: '找货历史加载失败，请稍后重试', icon: 'none' }), complete: () => this.setData({ loading: false }) });
    } catch (_) { this.setData({ loading: false }); }
  }
});
