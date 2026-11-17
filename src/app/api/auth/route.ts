import { NextResponse } from 'next/server';
import {
  createToken, hasPassword, hashPassword, loginLocked, recordLogin, sessionCookie, verifyPassword,
} from '@/lib/auth';
import { getSetting, setSetting } from '@/lib/settings';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');
  const password = String(body.password ?? '');

  if (action === 'logout') {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookie(req, ''));
    return res;
  }

  if (action === 'setup') {
    if (hasPassword()) return NextResponse.json({ error: '密码已经设置过了' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: '密码至少 6 位' }, { status: 400 });
    setSetting('password_hash', hashPassword(password));
  } else if (action === 'login') {
    if (loginLocked()) return NextResponse.json({ error: '输错次数太多，请 5 分钟后再试' }, { status: 429 });
    const ok = hasPassword() && verifyPassword(password, getSetting('password_hash'));
    recordLogin(ok);
    if (!ok) return NextResponse.json({ error: '密码不对' }, { status: 401 });
  } else {
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(req, createToken()));
  return res;
}
