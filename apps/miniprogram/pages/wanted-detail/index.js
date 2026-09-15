const app = getApp();
const { summarizeOffers } = require('../../utils/quote-summary');

function request(path, options = {}) {
  return new Promise((resolve, reject) => wx.request({
    url: app.globalData.apiBaseUrl + path,
    method: options.method || 'GET',
    data: options.data,
    header: { Authorization: 'Bearer ' + app.globalData.token },
    success: response => response.statusCode < 300 ? resolve(response.data) : reject(response.data || {}),
    fail: error => reject({ message: error.errMsg || '网络请求失败' })
  }));
}

function statusLabel(status) {
  return status === 'ACTIVE' ? '找货中' : status === 'FOUND' ? '已找到货' : status === 'CLOSED' ? '已关闭' : '已过期';
}

Page({
  data: {
    wanted: null, responses: [], loading: true, contact: null,
    offerOpen: false, selectedResponse: null,
    offerForm: { offerPrice: '', availableQuantity: '', stockType: 'SPOT', expectedAvailableAt: '', message: '' },
    today: new Date().toISOString().slice(0, 10), submittingOffer: false
  },

  async onLoad(query) {
    this.wantedId = query.id;
    await this.load();
  },

  async load() {
    try {
      this.setData({ loading: true });
      await app.ensureLogin();
      const wanted = await request('/api/v1/wanted-posts/' + this.wantedId);
      wanted.canRespond = wanted.status === 'ACTIVE' && new Date(wanted.expires_at).getTime() > Date.now();
      wanted.statusLabel = wanted.status === 'ACTIVE' && !wanted.canRespond ? '已到期' : statusLabel(wanted.status);
      wanted.createdLabel = String(wanted.created_at || '').replace('T', ' ').slice(0, 16);
      wanted.images = await Promise.all((wanted.images || []).map(async image => ({ ...image, object_key: await app.localImage(image.object_key) })));
      this.setData({ wanted, responses: [] });
      if (wanted.is_owner) await this.loadResponses();
      else if (wanted.my_response_id) await this.loadMyResponse(wanted.my_response_id);
    } catch (error) {
      wx.showToast({ title: error.message || '需求详情加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },

  async loadResponses() {
    try {
      const result = await request('/api/v1/me/wanted-posts/' + this.wantedId + '/responses');
      const responses = await this.decorateResponses(result.items || []);
      this.setData({ responses });
    } catch (error) {
      wx.showToast({ title: error.message || '供货响应加载失败', icon: 'none' });
    }
  },

  async loadMyResponse(id) {
    try {
      const item = await request('/api/v1/wanted-responses/' + id);
      this.setData({ responses: await this.decorateResponses([item]) });
    } catch (error) { wx.showToast({ title: error.message || '报价记录加载失败', icon: 'none' }); }
  },

  async decorateResponses(items) {
    const isOwner = Boolean(this.data.wanted && this.data.wanted.is_owner);
    return Promise.all(items.map(async item => ({
      ...item,
      ...summarizeOffers(item.offers),
      expanded: false,
      product_cover_url: await app.localImage(item.product_cover_url),
      createdLabel: String(item.created_at || '').replace('T', ' ').slice(0, 16),
      statusLabel: item.status === 'ACCEPTED' ? '已选择' : item.status === 'REJECTED' ? '不合适' : '待处理',
      offers: (item.offers || []).map((offer, index) => ({
        ...offer,
        round: index + 1,
        createdLabel: String(offer.created_at || '').replace('T', ' ').slice(0, 16),
        senderLabel: offer.sender_role === 'SUPPLIER'
          ? (isOwner ? '商家报价' : '我的报价')
          : (isOwner ? '我的还价' : '找货方还价'),
        stockLabel: offer.stock_type === 'PRESALE' ? '预售' : '现货',
        expectedLabel: offer.expected_available_at ? String(offer.expected_available_at).slice(0, 10) : ''
      }))
    })));
  },

  openProduct(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/detail/index?id=' + id });
  },

  toggleHistory(e) {
    this.setData({ responses: this.data.responses.map(item => String(item.id) === String(e.currentTarget.dataset.id) ? { ...item, expanded: !item.expanded } : item) });
  },
  moreActions(e) {
    const id = e.currentTarget.dataset.id;
    const owner = this.data.wanted.is_owner;
    wx.showActionSheet({ itemList: owner ? ['提出还价', '标记不合适', '已找到货'] : ['修改报价'], success: r => {
      if (r.tapIndex === 0) this.openOffer({ currentTarget: { dataset: { id } } });
      else this.updateResponse({ currentTarget: { dataset: { id, status: r.tapIndex === 1 ? 'REJECTED' : 'ACCEPTED' } } });
    } });
  },

  async updateResponse(e) {
    const { id, status } = e.currentTarget.dataset;
    const actionText = status === 'ACCEPTED' ? '确认已找到货后，此需求将退出市场，不再接收新报价。已有报价仍可查看，这不代表已付款或成交' : '将该货源标记为不合适';
    wx.showModal({
      title: status === 'ACCEPTED' ? '确认已找到货' : '确认标记', content: actionText + '？',
      success: async result => {
        if (!result.confirm) return;
        try {
          await request('/api/v1/wanted-responses/' + id, { method: 'PATCH', data: { status } });
          wx.showToast({ title: '操作成功', icon: 'success' });
          await this.load();
        } catch (error) { wx.showToast({ title: error.message || '操作失败', icon: 'none' }); }
      }
    });
  },

  async contact(e) {
    try {
      const contact = await request('/api/v1/wanted-responses/' + e.currentTarget.dataset.id + '/contact', { method: 'POST', data: {} });
      this.setData({ contact });
      const label = contact.contactType === 'WECHAT' ? '微信号' : '联系电话';
      wx.showModal({
        title: contact.responder + '的' + label,
        content: contact.value,
        confirmText: '复制联系方式',
        cancelText: '取消',
        success: result => { if (result.confirm) this.copyContact(); }
      });
    } catch (error) { wx.showToast({ title: error.message || '暂时无法获取联系方式', icon: 'none' }); }
  },

  copyContact() {
    if (!this.data.contact) return;
    wx.setClipboardData({ data: this.data.contact.value, success: () => wx.showToast({ title: '联系方式已复制', icon: 'success' }) });
  },

  openOffer(e) {
    const selectedResponse = this.data.responses.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    if (!selectedResponse) return;
    this.setData({
      offerOpen: true,
      selectedResponse,
      offerForm: {
        offerPrice: selectedResponse.offer_price != null ? String(selectedResponse.offer_price) : '',
        availableQuantity: selectedResponse.available_quantity || '',
        stockType: selectedResponse.stock_type || 'SPOT',
        expectedAvailableAt: selectedResponse.expected_available_at ? String(selectedResponse.expected_available_at).slice(0, 10) : '',
        message: ''
      }
    });
  },
  closeOffer() { if (!this.data.submittingOffer) this.setData({ offerOpen: false }); },
  stopBubble() {},
  onOfferInput(e) { this.setData({ ['offerForm.' + e.currentTarget.dataset.field]: e.detail.value }); },
  chooseOfferStockType(e) {
    const stockType = e.currentTarget.dataset.type;
    this.setData({ 'offerForm.stockType': stockType, 'offerForm.expectedAvailableAt': stockType === 'SPOT' ? '' : this.data.offerForm.expectedAvailableAt });
  },
  onOfferDateChange(e) { this.setData({ 'offerForm.expectedAvailableAt': e.detail.value }); },
  async submitOffer() {
    if (this.data.submittingOffer) return;
    const form = this.data.offerForm;
    const price = Number(form.offerPrice);
    if (!form.offerPrice.trim() || !Number.isFinite(price) || price < 0) return wx.showToast({ title: '请填写正确的本轮报价', icon: 'none' });
    if (!form.availableQuantity.trim()) return wx.showToast({ title: '请填写本轮数量', icon: 'none' });
    if (form.stockType === 'PRESALE' && !form.expectedAvailableAt) return wx.showToast({ title: '请选择预计可交货日期', icon: 'none' });
    try {
      this.setData({ submittingOffer: true });
      await request('/api/v1/wanted-responses/' + this.data.selectedResponse.id + '/offers', {
        method: 'POST',
        data: {
          offerPrice: price,
          availableQuantity: form.availableQuantity.trim(),
          stockType: form.stockType,
          expectedAvailableAt: form.stockType === 'PRESALE' ? form.expectedAvailableAt : undefined,
          message: form.message.trim() || undefined
        }
      });
      this.setData({ offerOpen: false });
      wx.showToast({ title: '新一轮报价已提交', icon: 'success' });
      if (this.data.wanted.is_owner) await this.loadResponses();
      else await this.loadMyResponse(this.data.selectedResponse.id);
    } catch (error) { wx.showToast({ title: error.message || '报价提交失败', icon: 'none' }); }
    finally { this.setData({ submittingOffer: false }); }
  },

  closeWanted() {
    wx.showActionSheet({
      itemList: ['标记为已找到货', '关闭该需求'],
      success: async result => {
        const status = result.tapIndex === 0 ? 'FOUND' : 'CLOSED';
        const confirmation = await new Promise(resolve => wx.showModal({ title: '结束需求', content: '确认后将退出需求市场，不再接收新报价。已有报价仍可查看。', success: resolve, fail: () => resolve({ confirm: false }) }));
        if (!confirmation.confirm) return;
        try {
          await request('/api/v1/wanted-posts/' + this.wantedId + '/status', { method: 'PATCH', data: { status } });
          wx.showToast({ title: '需求状态已更新', icon: 'success' });
          await this.load();
        } catch (error) { wx.showToast({ title: error.message || '状态更新失败', icon: 'none' }); }
      }
    });
  }
});
