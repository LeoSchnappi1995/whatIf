import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** 与记账 App 一致的密码哈希（scrypt + 随机盐） */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  try {
    const calc = scryptSync(pw, salt, 64);
    return timingSafeEqual(Buffer.from(hash, 'hex'), calc);
  } catch {
    return false;
  }
}
