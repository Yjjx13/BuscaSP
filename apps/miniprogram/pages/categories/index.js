const app = getApp();

Page({
  data: {
    categories: [], selectedIndex: 0,
    drawerVisible: false, drawerOpen: false,
    activeCategory: null, categoryQuery: '', categoryProducts: [], loadingProducts: false
  },

  onShow() { this.loadCategories(); },
  onUnload() {
    if (this.drawerTimer) clearTimeout(this.drawerTimer);
    if (this.searchTimer) clearTimeout(this.searchTimer);
  },

  loadCategories() {
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/categories/tree',
      success: response => {
        const categories = response.data.items || [];
        this.setData({ categories, selectedIndex: Math.min(this.data.selectedIndex, Math.max(categories.length - 1, 0)) });
      },
      fail: () => wx.showToast({ title: '分类加载失败，请重试', icon: 'none' })
    });
  },

  chooseTop(event) { this.setData({ selectedIndex: event.currentTarget.dataset.index }); },
  noop() {},

  openCategoryDetail(event) {
    const { id, name } = event.currentTarget.dataset;
    if (this.drawerTimer) clearTimeout(this.drawerTimer);
    this.setData({
      drawerVisible: true, drawerOpen: false,
      activeCategory: { id, name }, categoryQuery: '', categoryProducts: []
    }, () => {
      this.drawerTimer = setTimeout(() => this.setData({ drawerOpen: true }), 20);
      this.loadCategoryProducts();
    });
  },

  closeCategoryDetail() {
    this.setData({ drawerOpen: false });
    if (this.drawerTimer) clearTimeout(this.drawerTimer);
    this.drawerTimer = setTimeout(() => {
      if (!this.data.drawerOpen) this.setData({ drawerVisible: false, categoryProducts: [] });
    }, 260);
  },

  onCategoryInput(event) {
    const categoryQuery = event.detail.value;
    this.setData({ categoryQuery });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadCategoryProducts(), 300);
  },

  searchInCategory() { this.loadCategoryProducts(); },

  async loadCategoryProducts() {
    const categoryId = this.data.activeCategory?.id;
    if (!categoryId) return;
    const q = this.data.categoryQuery.trim();
    this.setData({ loadingProducts: true });
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/products?categoryId=' + encodeURIComponent(categoryId) + '&q=' + encodeURIComponent(q) + '&limit=20',
      success: async response => this.setData({ categoryProducts: await app.localizeProducts(response.data.items || []) }),
      fail: () => wx.showToast({ title: '商品加载失败，请重试', icon: 'none' }),
      complete: () => this.setData({ loadingProducts: false })
    });
  },

  detail(event) { wx.navigateTo({ url: '/pages/detail/index?id=' + event.currentTarget.dataset.id }); }
});
