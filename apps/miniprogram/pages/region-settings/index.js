const app = getApp();

Page({
  data: { regions: [], regionIndex: 0, selectedCode: '', saving: false },
  async onLoad() {
    try {
      const [regionsResponse, meResponse] = await Promise.all([
        new Promise((resolve, reject) => wx.request({ url: app.globalData.apiBaseUrl + '/api/v1/regions', success: r => r.statusCode < 300 ? resolve(r.data) : reject(r), fail: reject })),
        new Promise((resolve, reject) => wx.request({ url: app.globalData.apiBaseUrl + '/api/v1/me', header: { Authorization: 'Bearer ' + app.globalData.token }, success: r => r.statusCode < 300 ? resolve(r.data) : reject(r), fail: reject }))
      ]);
      const regions = regionsResponse.items || [];
      const regionIndex = Math.max(0, regions.findIndex(region => region.code === meResponse.region_code));
      this.setData({ regions, regionIndex, selectedCode: regions[regionIndex]?.code || '' });
    } catch (_) { wx.showToast({ title: '地区列表加载失败', icon: 'none' }); }
  },
  chooseRegion(event) {
    const regionIndex = Number(event.detail.value);
    this.setData({ regionIndex, selectedCode: this.data.regions[regionIndex]?.code || '' });
  },
  save() {
    if (!this.data.selectedCode || this.data.saving) return;
    this.setData({ saving: true });
    wx.request({
      url: app.globalData.apiBaseUrl + '/api/v1/me', method: 'PATCH',
      header: { Authorization: 'Bearer ' + app.globalData.token }, data: { regionCode: this.data.selectedCode },
      success: response => {
        if (response.statusCode < 300) { wx.showToast({ title: '地区已保存' }); setTimeout(() => wx.navigateBack(), 500); }
        else wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      },
      fail: () => wx.showToast({ title: '保存失败，请重试', icon: 'none' }),
      complete: () => this.setData({ saving: false })
    });
  }
});
