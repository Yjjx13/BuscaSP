const app = getApp();
const request = path => new Promise((resolve, reject) => wx.request({
  url: app.globalData.apiBaseUrl + path, header: { Authorization: 'Bearer ' + app.globalData.token },
  success: r => r.statusCode < 300 ? resolve(r.data) : reject(r.data), fail: reject
}));
Page({
  data: { user: {}, favorites: [], unreadWanted: 0, settingsOpen: false },
  async onShow() {
    try {
      await app.ensureLogin();
      const [user, wanted, favorites] = await Promise.all([request('/api/v1/me'), request('/api/v1/me/wanted-posts'), request('/api/v1/me/favorites')]);
      this.setData({ user, favorites: favorites.items || [], unreadWanted: (wanted.items || []).reduce((n, w) => n + Number(w.unread_response_count || 0), 0) });
    } catch (_) { wx.showToast({ title: '加载失败，请重新进入', icon: 'none' }); }
  },
  toggleSettings() { this.setData({ settingsOpen: !this.data.settingsOpen }); },
  goRegionSettings() { wx.navigateTo({ url: '/pages/region-settings/index' }); },
  goContacts() { wx.navigateTo({ url: '/pages/contact-settings/index' }); },
  goMyProducts() { wx.navigateTo({ url: '/pages/my-products/index' }); },
  goWantedHistory() { wx.navigateTo({ url: '/pages/my-wanted/index' }); },
  goQuotes() { wx.navigateTo({ url: '/pages/my-quotes/index' }); },
  goFavorites() { wx.navigateTo({ url: '/pages/my-favorites/index' }); }
});
