import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSetting, setSetting } from './settings';

export const COOKIE = 'diary_session';
const MAX_AGE = 60 * 60 * 24 * 30;

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 32);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

export function hasPassword() {
  return !!getSetting('password_hash');
}

function secret() {
  let s = getSetting('session_secret');
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    setSetting('session_secret', s);
  }
  return s;
}

function sign(payload: string) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

export function createToken() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return `${exp}.${sign(exp)}`;
}

function validToken(token: string | undefined) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = sign(exp);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function isAuthed() {
  if (!hasPassword()) return false;
  const jar = await cookies();
  return validToken(jar.get(COOKIE)?.value);
}

/** API 路由用：未登录时返回 401 响应，已登录返回 null */
export async function guard() {
  if (await isAuthed()) return null;
  return NextResponse.json({ error: '未登录' }, { status: 401 });
}

export function sessionCookie(req: Request, token: string) {
  const https = req.headers.get('x-forwarded-proto') === 'https' || new URL(req.url).protocol === 'https:';
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: https,
    path: '/',
    maxAge: token ? MAX_AGE : 0,
  };
}

// 简单的防暴力破解：连续输错 5 次锁 5 分钟
const fails = { count: 0, lockedUntil: 0 };

export function loginLocked() {
  return Date.now() < fails.lockedUntil;
}

export function recordLogin(ok: boolean) {
  if (ok) {
    fails.count = 0;
    return;
  }
  fails.count += 1;
  if (fails.count >= 5) {
    fails.count = 0;
    fails.lockedUntil = Date.now() + 5 * 60 * 1000;
  }
}
