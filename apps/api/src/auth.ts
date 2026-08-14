import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from './config.js';

export async function requireUser(request: FastifyRequest) {
  await request.jwtVerify();
  return Number(request.user.sub);
}

type WechatSession = { openid?: string; unionid?: string; session_key?: string; errcode?: number; errmsg?: string };

async function exchangeWechatCode(code: string): Promise<WechatSession> {
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', config.wechatAppId);
  url.searchParams.set('secret', config.wechatAppSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`微信登录服务响应异常：${response.status}`);
  return response.json() as Promise<WechatSession>;
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/wechat-login', async (request, reply) => {
    if (!config.wechatAppId || !config.wechatAppSecret) {
      return reply.code(503).send({ code: 'WECHAT_NOT_CONFIGURED', message: '尚未配置微信小程序 AppID 和 AppSecret' });
    }
    const body = z.object({ code: z.string().trim().min(1).max(128) }).parse(request.body);
    const session = await exchangeWechatCode(body.code);
    if (session.errcode || !session.openid) {
      request.log.warn({ errcode: session.errcode, errmsg: session.errmsg }, '微信 code2Session 失败');
      return reply.code(401).send({ code: 'WECHAT_LOGIN_FAILED', message: '微信登录失败，请重新进入小程序' });
    }
    const existing = await app.pg.query('SELECT id,nickname,avatar_url,region_code,status FROM users WHERE wechat_openid=$1', [session.openid]);
    let user = existing.rows[0];
    const isNewUser = !user;
    if (!user) {
      user = (await app.pg.query(`INSERT INTO users (wechat_openid,unionid,nickname,login_source,last_login_at)
        VALUES ($1,$2,'微信用户','WECHAT',NOW()) RETURNING id,nickname,avatar_url,region_code,status`, [session.openid, session.unionid ?? null])).rows[0];
    } else {
      user = (await app.pg.query(`UPDATE users SET unionid=COALESCE($1,unionid),login_source='WECHAT',last_login_at=NOW(),updated_at=NOW()
        WHERE id=$2 RETURNING id,nickname,avatar_url,region_code,status`, [session.unionid ?? null, user.id])).rows[0];
    }
    if (user.status === 'BANNED' || user.status === 'DELETED') return reply.code(403).send({ code: 'ACCOUNT_DISABLED', message: '账号当前不可登录' });
    const token = app.jwt.sign({ sub: String(user.id) }, { expiresIn: '7d' });
    return { token, user, isNewUser };
  });

  app.post('/api/v1/auth/dev-login', async (request, reply) => {
    if (!config.enableDevLogin) return reply.code(404).send();
    const body = z.object({ nickname:z.string().max(80).optional(),openid:z.string().max(64).optional() }).parse(request.body);
    const openid = body.openid ?? `dev_${Date.now()}`;
    const existing = await app.pg.query('SELECT id,nickname,avatar_url,region_code,status FROM users WHERE wechat_openid=$1', [openid]);
    const user = existing.rows[0] ?? (await app.pg.query(`INSERT INTO users (wechat_openid,nickname,login_source,last_login_at)
      VALUES ($1,$2,'DEV',NOW()) RETURNING id,nickname,avatar_url,region_code,status`, [openid, body.nickname?.slice(0,80)||'找货用户'])).rows[0];
    if (existing.rows[0]) await app.pg.query("UPDATE users SET login_source='DEV',last_login_at=NOW(),updated_at=NOW() WHERE id=$1", [user.id]);
    if (user.status === 'BANNED' || user.status === 'DELETED') return reply.code(403).send({ code:'ACCOUNT_DISABLED',message:'账号当前不可登录' });
    const token = app.jwt.sign({ sub:String(user.id) }, { expiresIn:'7d' });
    return { token,user,isNewUser:!existing.rows[0] };
  });

  app.get('/api/v1/auth/session', async (request) => {
    const userId = await requireUser(request);
    const result = await app.pg.query(`SELECT id,nickname,avatar_url,region_code,status,login_source,last_login_at
      FROM users WHERE id=$1 AND deleted_at IS NULL`, [userId]);
    return { authenticated:Boolean(result.rows[0]),user:result.rows[0]??null };
  });
}
