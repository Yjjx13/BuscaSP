# BuscaSP - 行业找货与货源发布平台

第一期 MVP：让每位用户都能用「图片 + 描述 + 价格」快速发布货源，并完成搜索、查看、联系、找货需求和举报的闭环。

## 项目结构

- `apps/api`：REST API（Fastify + PostgreSQL）
- `apps/admin`：运营管理后台（React + Vite）
- `apps/miniprogram`：微信小程序客户端基础页面
- `packages/shared`：前后端共享状态、类型与校验常量
- `infra/postgres`：数据库迁移与种子数据
- `infra/docker-compose.yml`：本地 PostgreSQL 与 Redis
- `docs`：接口与交付说明

## 本地启动

1. 复制 `apps/api/.env.example` 为 `apps/api/.env`，按实际环境填写微信和存储配置。
2. 启动基础服务：`docker compose -f infra/docker-compose.yml up -d`
3. 新建数据库会自动执行 `infra/postgres/001_initial.sql` 和后续迁移；已有数据库需要按编号依次执行新增迁移。
4. 安装依赖：`pnpm install`
5. 启动接口：`pnpm --filter @buscasp/api dev`
6. 启动后台：`pnpm --filter @buscasp/admin dev`
7. 使用微信开发者工具导入 `apps/miniprogram`。

详细设计见 `output/pdf/行业找货与货源发布小程序_详细设计说明书_V1.0.pdf`。
