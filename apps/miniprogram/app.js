App({
  globalData: { apiBaseUrl: 'http://127.0.0.1:3000', token: '', user: null, loginPromise: null },

  onLaunch() {
    const savedToken = wx.getStorageSync('access_token');
    if (savedToken) this.globalData.token = savedToken;
    this.startLogin();
  },

  startLogin() {
    if (this.globalData.loginPromise) return this.globalData.loginPromise;
    const task = this.login();
    this.globalData.loginPromise = task;
    task.catch(() => {}).finally(() => {
      if (this.globalData.loginPromise === task) this.globalData.loginPromise = null;
    });
    return task;
  },

  async login() {
    if (this.globalData.token) {
      const valid = await this.checkSession();
      if (valid) return this.globalData.user;
      this.globalData.token = '';
      this.globalData.user = null;
      wx.removeStorageSync('access_token');
    }

    try {
      const loginResult = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
      try {
        const response = await this.requestLogin('/api/v1/auth/wechat-login', { code: loginResult.code });
        return this.acceptLogin(response);
      } catch (error) {
        if (error && error.code === 'WECHAT_NOT_CONFIGURED') {
          const response = await this.requestLogin('/api/v1/auth/dev-login', {
            openid: 'miniprogram_dev_user',
            nickname: '小程序测试用户'
          });
          return this.acceptLogin(response);
        }
        throw error;
      }
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '登录失败，请检查本地服务', icon: 'none' });
      throw error;
    }
  },

  requestLogin(path, data) {
    return new Promise((resolve, reject) => wx.request({
      url: this.globalData.apiBaseUrl + path,
      method: 'POST',
      data,
      timeout: 8000,
      success: response => response.statusCode < 300 ? resolve(response.data) : reject(response.data),
      fail: error => reject({ message: error.errMsg || '无法连接本地服务' })
    }));
  },

  acceptLogin(response) {
    this.globalData.token = response.token;
    this.globalData.user = response.user;
    wx.setStorageSync('access_token', response.token);
    return response.user;
  },

  checkSession() {
    return new Promise(resolve => wx.request({
      url: this.globalData.apiBaseUrl + '/api/v1/auth/session',
      header: { Authorization: 'Bearer ' + this.globalData.token },
      timeout: 5000,
      success: response => {
        if (response.statusCode === 200 && response.data.authenticated) {
          this.globalData.user = response.data.user;
          resolve(true);
        } else resolve(false);
      },
      fail: () => resolve(false)
    }));
  },

  ensureLogin() {
    if (this.globalData.token && this.globalData.user) return Promise.resolve(this.globalData.user);
    return this.startLogin();
  },

  // Newer DevTools rejects HTTP directly in <image>, even for localhost.
  // The API can still be requested over HTTP in local development, so cache
  // uploaded images as temporary files before binding them to image elements.
  localImage(url) {
    if (typeof url !== 'string' || !/^http:\/\/127\.0\.0\.1:3000\/uploads\//.test(url)) return Promise.resolve(url);
    return new Promise(resolve => wx.downloadFile({
      url,
      success: result => resolve(result.statusCode === 200 ? result.tempFilePath : url),
      fail: () => resolve(url)
    }));
  },

  async localizeProducts(products) {
    return Promise.all((products || []).map(async product => ({
      ...product,
      cover_url: await this.localImage(product.cover_url),
      images: product.images ? await Promise.all(product.images.map(async image => ({
        ...image,
        object_key: await this.localImage(image.object_key),
        thumb_key: await this.localImage(image.thumb_key)
      }))) : product.images
    })));
  }
});
