import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from './config.js';

const key = createHash('sha256').update(config.contactEncryptionSecret).digest();

export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const [ivValue, tagValue, encryptedValue] = payload.split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('无法读取联系方式');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64')), decipher.final()]).toString('utf8');
}

export function maskContact(type: 'PHONE' | 'WECHAT', value: string): string {
  if (type === 'PHONE') return value.length <= 4 ? '****' : `${value.slice(0, 3)}****${value.slice(-4)}`;
  return value.length <= 3 ? `${value[0] ?? '*'}***` : `${value.slice(0, 2)}***${value.slice(-1)}`;
}

