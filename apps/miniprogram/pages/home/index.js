const app = getApp();

Page({
  data: { products: [], categories: [{ id: '', name: '猜你喜欢' }], activeCategoryId: '' },
  onLoad() { this.loadCategories(); },
  onShow() { this.loadProducts(); },
  loadCategories() {
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/categories/tree',
      success: response => this.setData({ categories: [{ id: '', name: '猜你喜欢' }].concat(response.data.items || []) })
    });
  },
  loadProducts() {
    const categoryPart = this.data.activeCategoryId ? '?categoryId=' + this.data.activeCategoryId : '';
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/products' + categoryPart,
      success: async response => this.setData({ products: await app.localizeProducts(response.data.items || []) })
    });
  },
  chooseCategory(event) {
    const id = event.currentTarget.dataset.id;
    if (id === this.data.activeCategoryId) return;
    this.setData({ activeCategoryId: id });
    this.loadProducts();
  },
  goSearch() { wx.switchTab({ url: '/pages/search/index' }); },
  goPublish() { wx.switchTab({ url: '/pages/publish/index' }); },
  goWanted() { wx.navigateTo({ url: '/pages/wanted/index' }); },
  goDetail(event) { wx.navigateTo({ url: '/pages/detail/index?id=' + event.currentTarget.dataset.id }); }
});
