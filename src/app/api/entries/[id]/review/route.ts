import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { AiError } from '@/lib/ai';
import { get, nowIso, run, type Entry } from '@/lib/db';
import { levelInfo } from '@/lib/level';
import { reviewDiary } from '@/lib/review';
import { beginReview, endReview, isReviewing, latestReview, takeReviewError } from '@/lib/review-state';
import type { ReviewView } from '@/lib/shared';

type Ctx = { params: Promise<{ id: string }> };

const MAX_CHARS = 6000;

/** 批改进度：页面打开时和等待批改时用来查询 */
export async function GET(_req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  if (isReviewing(id)) return NextResponse.json({ reviewing: true });
  return NextResponse.json({ reviewing: false, review: latestReview(id), level: levelInfo(), error: takeReviewError(id) });
}

export async function POST(req: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  const entry = get<Entry>('SELECT * FROM entries WHERE id = ?', id);
  if (!entry) return NextResponse.json({ error: '日记不存在' }, { status: 404 });
  if (isReviewing(id)) return NextResponse.json({ error: '这篇日记正在批改中，请稍等。' }, { status: 409 });

  // 先保存再批改：就算 AI 失败，日记也不会丢
  let content = entry.content;
  if (typeof body.content === 'string' && body.content !== content) {
    content = body.content;
    run('UPDATE entries SET content = ?, updated_at = ? WHERE id = ?', content, nowIso(), id);
  }
  const text = content.trim();
  if (!text) return NextResponse.json({ error: '日记还是空的，先写几句吧' }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: `这篇太长了（${text.length} 字符），请控制在 ${MAX_CHARS} 字符以内再批改` }, { status: 400 });
  }

  beginReview(id);
  try {
    const { result, model } = await reviewDiary(text, levelInfo().effective);
    const created = nowIso();
    const info = run(
      'INSERT INTO reviews(entry_id, original_text, result, level_estimate, model, created_at) VALUES(?,?,?,?,?,?)',
      id,
      content,
      JSON.stringify(result),
      result.level_estimate,
      model,
      created,
    );
    endReview(id);
    const review: ReviewView = {
      id: Number(info.lastInsertRowid),
      original_text: content,
      created_at: created,
      model,
      result,
    };
    return NextResponse.json({ review, level: levelInfo() });
  } catch (e) {
    const message = e instanceof AiError ? e.message : `批改失败：${(e as Error).message}`;
    endReview(id, message);
    if (e instanceof AiError) return NextResponse.json({ error: message }, { status: 502 });
    console.error('review failed', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
