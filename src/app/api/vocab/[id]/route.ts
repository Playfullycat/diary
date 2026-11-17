import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { get, run, type Vocab } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  for (const field of ['phonetic', 'meaning', 'example', 'note'] as const) {
    if (typeof body[field] === 'string') run(`UPDATE vocab SET ${field} = ? WHERE id = ?`, body[field].trim(), id);
  }
  // 在生词本和搭配本之间移动
  if (body.kind === 'word' || body.kind === 'phrase') run('UPDATE vocab SET kind = ? WHERE id = ?', body.kind, id);
  return NextResponse.json({ vocab: get<Vocab>('SELECT * FROM vocab WHERE id = ?', id) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  run('DELETE FROM vocab WHERE id = ?', Number((await ctx.params).id));
  return NextResponse.json({ ok: true });
}
