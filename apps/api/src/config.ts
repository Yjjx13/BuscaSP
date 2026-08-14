import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://buscasp:buscasp_dev_password@localhost:5432/buscasp',
  jwtSecret: process.env.JWT_SECRET ?? 'local-development-only-change-me',
  contactEncryptionSecret: process.env.CONTACT_ENCRYPTION_SECRET ?? 'local-contact-encryption-only-change-before-deployment',
  adminKey: process.env.ADMIN_KEY ?? 'buscasp-local-admin',
  wechatAppId: process.env.WECHAT_APP_ID ?? '',
  wechatAppSecret: process.env.WECHAT_APP_SECRET ?? '',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  enableDevLogin: process.env.ENABLE_DEV_LOGIN === 'true'
};
