const app = getApp();
Page({
  data: { items: [], loading: false, error: '' },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      await app.ensureLogin();
      const result = await new Promise((resolve, reject) => wx.request({
        url: app.globalData.apiBaseUrl + '/api/v1/me/wanted-responses', header: { Authorization: 'Bearer ' + app.globalData.token },
        success: r => r.statusCode < 300 ? resolve(r.data) : reject(r.data), fail: reject
      }));
      this.setData({ items: await Promise.all((result.items || []).map(async item => ({ ...item,
        cover_url: await app.localImage(item.cover_url),
        statusLabel: item.status === 'ACCEPTED' ? '已选择' : item.status === 'REJECTED' ? '不合适' : '待处理',
        wantedLabel: item.wanted_status === 'FOUND' ? '已找到货' : item.wanted_status !== 'ACTIVE' ? '已关闭' : new Date(item.expires_at).getTime() <= Date.now() ? '已到期' : '找货中',
        timeLabel: String(item.updated_at || '').replace('T', ' ').slice(0, 16)
      }))) });
    } catch (e) { this.setData({ error: e.message || '报价加载失败，请重试' }); }
    finally { this.setData({ loading: false }); }
  },
  detail(e) { wx.navigateTo({ url: '/pages/wanted-detail/index?id=' + e.currentTarget.dataset.id }); },
  market() { wx.switchTab({ url: '/pages/wanted/index' }); }
});
