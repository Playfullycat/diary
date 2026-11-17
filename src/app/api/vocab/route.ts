import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { get, nowIso, run, type Vocab } from '@/lib/db';

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const term = s(body.term);
  if (!term) return NextResponse.json({ error: '请填写内容' }, { status: 400 });
  const key = term.toLowerCase();

  const existing = get<Vocab>('SELECT * FROM vocab WHERE term_key = ?', key);
  if (existing) return NextResponse.json({ vocab: existing, existed: true });

  const info = run(
    `INSERT INTO vocab(term, term_key, phonetic, meaning, example, source_sentence, source_type, entry_id, created_at, kind)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    term,
    key,
    s(body.phonetic),
    s(body.meaning),
    s(body.example),
    s(body.source_sentence),
    s(body.source_type) || 'manual',
    Number.isInteger(body.entry_id) ? body.entry_id : null,
    nowIso(),
    body.kind === 'phrase' ? 'phrase' : 'word',
  );
  const vocab = get<Vocab>('SELECT * FROM vocab WHERE id = ?', Number(info.lastInsertRowid));
  return NextResponse.json({ vocab, existed: false });
}
