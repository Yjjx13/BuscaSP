# 微信登录与用户管理接口

## 正式微信登录配置

在 `apps/api/.env` 中填写：

```env
WECHAT_APP_ID=你的小程序AppID
WECHAT_APP_SECRET=你的小程序AppSecret
```

AppSecret 不应提交到版本库或发送到聊天中。未配置时，小程序在本地开发环境自动回退到测试登录。

## 登录接口

- `POST /api/v1/auth/wechat-login`：使用 `wx.login` 返回的 code 登录。
- `POST /api/v1/auth/dev-login`：仅限本地开发的测试账号登录。
- `GET /api/v1/auth/session`：验证令牌并读取当前用户。

每个微信 `openid` 对应一个独立用户。重复登录更新最后登录时间，不会重复创建用户。

## 管理后台用户接口

所有后台接口需提供请求头 `x-admin-key`。

- `GET /api/v1/admin/users`：用户列表、登录来源、最后登录时间、发布数量。
- `GET /api/v1/admin/users/:id`：用户详情、脱敏联系方式、商品与找货记录。
- `POST /api/v1/admin/users`：新增本地测试用户。
- `PUT /api/v1/admin/users/:id`：修改昵称、地区、状态和联系方式权限。
- `DELETE /api/v1/admin/users/:id`：逻辑删除用户。
- `POST /api/v1/admin/users/:id/restore`：恢复用户。

