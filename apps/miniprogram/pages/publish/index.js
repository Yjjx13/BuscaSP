Page({
  data: { sheetOpen: false },
  onShow() { setTimeout(() => this.setData({ sheetOpen: true }), 20); },
  goProductCreate() { wx.navigateTo({ url: '/pages/product-create/index' }); },
  goWantedCreate() { wx.navigateTo({ url: '/pages/wanted-create/index' }); }
});
