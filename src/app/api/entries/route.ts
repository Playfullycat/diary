import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { get, localDate, nowIso, run } from '@/lib/db';

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? String(body.date) : localDate();

  // 当天已有空白日记就直接用它，避免点多次产生一堆空记录
  const empty = get<{ id: number }>("SELECT id FROM entries WHERE date = ? AND trim(content) = '' LIMIT 1", date);
  if (empty) return NextResponse.json({ id: empty.id });

  const now = nowIso();
  const info = run('INSERT INTO entries(date, content, created_at, updated_at) VALUES(?, ?, ?, ?)', date, '', now, now);
  return NextResponse.json({ id: Number(info.lastInsertRowid) });
}
