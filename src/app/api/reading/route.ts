import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { BOOKS, READING_STATUSES, type ReadingStatus } from '@/lib/books';
import { nowIso, run } from '@/lib/db';

/** 标记一本书的阅读状态；status 为空表示取消标记 */
export async function PUT(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!BOOKS.some((b) => b.id === id)) return NextResponse.json({ error: '书单里没有这本书' }, { status: 400 });
  if (!body.status) {
    run('DELETE FROM reading WHERE book_id = ?', id);
    return NextResponse.json({ id, status: null });
  }
  const status = body.status as ReadingStatus;
  if (!READING_STATUSES.includes(status)) return NextResponse.json({ error: '未知的状态' }, { status: 400 });
  run(
    `INSERT INTO reading(book_id, status, updated_at) VALUES(?,?,?)
     ON CONFLICT(book_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    id, status, nowIso(),
  );
  return NextResponse.json({ id, status });
}
