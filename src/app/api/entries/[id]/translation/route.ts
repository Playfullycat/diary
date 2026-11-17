import { NextResponse } from 'next/server';
import { aiTask } from '@/lib/ai-route';
import { guard } from '@/lib/auth';
import { nowIso, run } from '@/lib/db';
import { levelInfo } from '@/lib/level';
import { splitSentences, type TransFeedback } from '@/lib/practice';
import { latestReview } from '@/lib/review-state';
import { getTranslation, transKey } from '@/lib/translation';
import { reviewTranslations, translateSentences } from '@/lib/tutor';

type Ctx = { params: Promise<{ id: string }> };

const MAX_SENTENCES = 40;

function cleanAnswers(raw: unknown, count: number) {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => (typeof list[i] === 'string' ? (list[i] as string).trim().slice(0, 1000) : ''));
}

/** action=create：生成中文提示；action=feedback：保存译文并让 AI 点评 */
export async function POST(req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  const review = latestReview(id);
  if (!review) return NextResponse.json({ error: '这篇日记还没有批改，先批改再做回译。' }, { status: 400 });

  if (body.action === 'create') {
    return aiTask(transKey(id), async () => {
      if (!getTranslation(review.id)) {
        const sentences = splitSentences(review.result.corrected_text).slice(0, MAX_SENTENCES);
        if (!sentences.length) throw new Error('修改版里没有可以练习的句子');
        const { value, model } = await translateSentences(sentences);
        const now = nowIso();
        run(
          'INSERT INTO translations(entry_id, review_id, sentences, model, created_at, updated_at) VALUES(?,?,?,?,?,?)',
          id, review.id, JSON.stringify(value), model, now, now,
        );
      }
      return { translation: getTranslation(review.id) };
    });
  }

  if (body.action === 'feedback') {
    const tr = getTranslation(review.id);
    if (!tr) return NextResponse.json({ error: '还没有生成回译练习' }, { status: 400 });
    const answers = cleanAnswers(body.answers, tr.sentences.length);
    const answered = answers.map((a, i) => ({ a, i })).filter((x) => x.a);
    if (!answered.length) return NextResponse.json({ error: '先写几句译文再点评' }, { status: 400 });
    run('UPDATE translations SET answers = ?, updated_at = ? WHERE id = ?', JSON.stringify(answers), nowIso(), tr.id);
    return aiTask(transKey(id), async () => {
      const { value } = await reviewTranslations(
        answered.map(({ a, i }) => ({ zh: tr.sentences[i].zh, reference: tr.sentences[i].en, answer: a })),
        levelInfo().effective,
      );
      const feedback: (TransFeedback | null)[] = tr.sentences.map(() => null);
      answered.forEach(({ i }, k) => { feedback[i] = value[k]; });
      run('UPDATE translations SET feedback = ?, updated_at = ? WHERE id = ?', JSON.stringify(feedback), nowIso(), tr.id);
      return { translation: getTranslation(review.id) };
    });
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 });
}

/** 保存译文（不点评）。译文变了，旧的点评就作废 */
export async function PUT(req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  const review = latestReview(id);
  const tr = review && getTranslation(review.id);
  if (!review || !tr) return NextResponse.json({ error: '还没有生成回译练习' }, { status: 400 });
  const answers = cleanAnswers(body.answers, tr.sentences.length);
  run("UPDATE translations SET answers = ?, feedback = '[]', updated_at = ? WHERE id = ?", JSON.stringify(answers), nowIso(), tr.id);
  return NextResponse.json({ translation: getTranslation(review.id) });
}
