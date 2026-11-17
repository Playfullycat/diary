import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { get, run, type Vocab } from '@/lib/db';
import { GRADES, dueAt, nextState, type CardState, type Grade } from '@/lib/srs';

type Ctx = { params: Promise<{ id: string }> };

/** 记录一次复习结果，并排好下次复习的时间 */
export async function POST(req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  const grade = body.grade as Grade;
  if (!GRADES.includes(grade)) return NextResponse.json({ error: '未知的复习结果' }, { status: 400 });
  const card = get<Vocab & CardState>('SELECT * FROM vocab WHERE id = ?', id);
  if (!card) return NextResponse.json({ error: '这个词已经不在了' }, { status: 404 });

  const next = nextState(card, grade);
  const due = dueAt(next).toISOString();
  run('UPDATE vocab SET interval_days = ?, ease = ?, reps = ?, due_at = ? WHERE id = ?', next.interval_days, next.ease, next.reps, due, id);
  return NextResponse.json({ ok: true, due_at: due, ...next });
}
