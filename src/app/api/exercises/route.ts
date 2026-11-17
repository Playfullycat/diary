import { NextResponse } from 'next/server';
import { aiTask } from '@/lib/ai-route';
import { guard } from '@/lib/auth';
import { nowIso, run } from '@/lib/db';
import { EXERCISE_KEY, getExercise } from '@/lib/exercises';
import { levelInfo } from '@/lib/level';
import { groupMistakes, loadMistakes } from '@/lib/mistakes';
import { makeExercises } from '@/lib/tutor';

const MAX_FOCUS = 3;
const EXAMPLES_PER_FOCUS = 4;

/** 按选定的错误类型出一组新题 */
export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const wanted: string[] = Array.isArray(body.focus) ? body.focus.filter((x: unknown) => typeof x === 'string') : [];

  // 练习只针对"必须改"的错误；"不够地道"这类建议没有唯一答案，不适合出题
  const groups = groupMistakes(loadMistakes().mistakes.filter((m) => m.severity === 'must'));
  if (!groups.length) return NextResponse.json({ error: '还没有批改记录，先批改几篇日记再来练习。' }, { status: 400 });
  const chosen = (wanted.length ? groups.filter((g) => wanted.includes(g.name)) : groups).slice(0, MAX_FOCUS);
  if (!chosen.length) return NextResponse.json({ error: '选的错误类型不存在' }, { status: 400 });

  return aiTask(EXERCISE_KEY, async () => {
    // mistakes 按日期从新到旧，取每类最近的几个例子
    const focus = chosen.map((g) => ({ name: g.name, examples: g.list.slice(0, EXAMPLES_PER_FOCUS) }));
    const { value, model } = await makeExercises(focus, levelInfo().effective);
    const info = run(
      'INSERT INTO exercises(focus, questions, model, created_at) VALUES(?,?,?,?)',
      JSON.stringify(focus.map((f) => f.name)), JSON.stringify(value), model, nowIso(),
    );
    return { exercise: getExercise(Number(info.lastInsertRowid)) };
  });
}
