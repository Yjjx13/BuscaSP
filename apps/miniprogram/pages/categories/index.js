const app = getApp();

Page({
  data: { categories: [], selectedIndex: 0 },
  onShow() {
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/categories/tree',
      success: response => this.setData({ categories: response.data.items || [], selectedIndex: 0 }),
      fail: () => wx.showToast({ title: '分类加载失败，请重试', icon: 'none' })
    });
  },
  chooseTop(event) { this.setData({ selectedIndex: event.currentTarget.dataset.index }); },
  searchCategory(event) {
    const { id, name } = event.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/search/index?categoryId=' + id + '&categoryName=' + encodeURIComponent(name) });
  }
});
