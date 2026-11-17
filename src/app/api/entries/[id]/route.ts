import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { get, nowIso, run } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  if (!get('SELECT id FROM entries WHERE id = ?', id)) return NextResponse.json({ error: '日记不存在' }, { status: 404 });

  if (typeof body.content === 'string') {
    run('UPDATE entries SET content = ?, updated_at = ? WHERE id = ?', body.content, nowIso(), id);
  }
  if (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    run('UPDATE entries SET date = ?, updated_at = ? WHERE id = ?', body.date, nowIso(), id);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  run('DELETE FROM entries WHERE id = ?', id);
  return NextResponse.json({ ok: true });
}
