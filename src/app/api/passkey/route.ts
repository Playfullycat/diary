import { NextResponse } from 'next/server';
import { createToken, guard, hasPassword, sessionCookie } from '@/lib/auth';
import { PasskeyError, deletePasskey, listPasskeys, login, loginOptions, register, registerOptions } from '@/lib/passkey';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json({ passkeys: listPasskeys() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');
  try {
    // 登录的两步不需要先登录
    if (action === 'loginOptions') {
      if (!hasPassword()) return fail('请先设置登录密码');
      return NextResponse.json({ options: await loginOptions(req) });
    }
    if (action === 'login') {
      if (!hasPassword()) return fail('请先设置登录密码');
      await login(body.response);
      const res = NextResponse.json({ ok: true });
      res.cookies.set(sessionCookie(req, createToken()));
      return res;
    }

    const denied = await guard();
    if (denied) return denied;
    if (action === 'registerOptions') return NextResponse.json({ options: await registerOptions(req) });
    if (action === 'register') {
      await register(req, body.response, String(body.name ?? ''));
      return NextResponse.json({ passkeys: listPasskeys() });
    }
    return fail('未知操作');
  } catch (e) {
    if (e instanceof PasskeyError) return fail(e.message);
    throw e;
  }
}

export async function DELETE(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!deletePasskey(id)) return fail('没有找到这个通行密钥', 404);
  return NextResponse.json({ passkeys: listPasskeys() });
}
