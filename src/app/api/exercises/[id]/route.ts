import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { nowIso, run } from '@/lib/db';
import { getExercise } from '@/lib/exercises';
import { scoreOf } from '@/lib/practice';

type Ctx = { params: Promise<{ id: string }> };

/** 交卷：保存答案并算分 */
export async function PUT(req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  const ex = getExercise(id);
  if (!ex) return NextResponse.json({ error: '这组练习不存在' }, { status: 404 });
  const raw = Array.isArray(body.answers) ? body.answers : [];
  const answers = ex.questions.map((_, i) => (typeof raw[i] === 'string' ? (raw[i] as string).trim().slice(0, 200) : ''));
  run('UPDATE exercises SET answers = ?, score = ?, done_at = ? WHERE id = ?', JSON.stringify(answers), scoreOf(ex.questions, answers), nowIso(), id);
  return NextResponse.json({ exercise: getExercise(id) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  run('DELETE FROM exercises WHERE id = ?', Number((await ctx.params).id));
  return NextResponse.json({ ok: true });
}
