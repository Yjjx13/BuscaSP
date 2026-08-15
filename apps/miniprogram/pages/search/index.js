const app = getApp();

function request(options) {
  return new Promise((resolve, reject) => wx.request({
    ...options,
    success: response => response.statusCode < 300 ? resolve(response.data) : reject(response.data || {}),
    fail: reject
  }));
}

Page({
  data: { q: '', items: [], history: [], suggestions: [], categoryId: '', categoryName: '' },

  onLoad(query) {
    if (query.categoryId) {
      this.setData({ categoryId: query.categoryId, categoryName: decodeURIComponent(query.categoryName || '') });
      this.search();
    }
  },
  onShow() { this.loadHistory(); this.applyCategoryFilter(); },
  onUnload() { if (this.suggestionTimer) clearTimeout(this.suggestionTimer); },

  onInput(event) {
    const query = event.detail.value;
    this.setData({ q: query });
    if (this.suggestionTimer) clearTimeout(this.suggestionTimer);
    if (!query.trim()) {
      this.setData({ suggestions: [], items: [] });
      if (this.data.categoryId) this.search();
      return;
    }
    this.suggestionTimer = setTimeout(() => this.loadSuggestions(query), 180);
  },

  async loadSuggestions(query) {
    try {
      const result = await request({ url: app.globalData.apiBaseUrl + '/api/v1/search-suggestions?q=' + encodeURIComponent(query) });
      if (this.data.q === query) this.setData({ suggestions: result.items || [] });
    } catch (_) { this.setData({ suggestions: [] }); }
  },

  async loadHistory() {
    try {
      await app.ensureLogin();
      const result = await request({ url: app.globalData.apiBaseUrl + '/api/v1/me/search-history', header: { Authorization: 'Bearer ' + app.globalData.token } });
      this.setData({ history: result.items || [] });
    } catch (_) {}
  },

  applyCategoryFilter() {
    const filter = wx.getStorageSync('category_filter');
    if (!filter || !filter.id || String(filter.id) === String(this.data.categoryId)) return;
    this.setData({ categoryId: filter.id, categoryName: filter.name || '', q: '', items: [], suggestions: [] });
    this.search();
  },

  async search(event) {
    const query = (event?.currentTarget?.dataset?.query || this.data.q).trim();
    this.setData({ q: query, suggestions: [] });
    // 空关键词不请求商品列表，避免把全部商品误当成搜索结果。
    // 已从分类页进入时仍保留分类浏览结果。
    if (!query && !this.data.categoryId) {
      this.setData({ items: [] });
      return;
    }
    const categoryPart = this.data.categoryId ? '&categoryId=' + this.data.categoryId : '';
    wx.request({ url: app.globalData.apiBaseUrl + '/api/v1/products?q=' + encodeURIComponent(query) + categoryPart, success: async response => this.setData({ items: await app.localizeProducts(response.data.items || []) }) });
    if (!query) return;
    try {
      await app.ensureLogin();
      await request({ url: app.globalData.apiBaseUrl + '/api/v1/me/search-history', method: 'POST', header: { Authorization: 'Bearer ' + app.globalData.token }, data: { query } });
      this.loadHistory();
    } catch (_) {}
  },

  chooseSuggestion(event) { this.search({ currentTarget: { dataset: { query: event.currentTarget.dataset.query } } }); },

  async clearHistory() {
    try {
      await request({ url: app.globalData.apiBaseUrl + '/api/v1/me/search-history', method: 'DELETE', header: { Authorization: 'Bearer ' + app.globalData.token } });
      this.setData({ history: [] });
    } catch (_) { wx.showToast({ title: '清空失败，请重试', icon: 'none' }); }
  },

  detail(event) { wx.navigateTo({ url: '/pages/detail/index?id=' + event.currentTarget.dataset.id }); }
});
