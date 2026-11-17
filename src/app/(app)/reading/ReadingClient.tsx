'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BOOKS, BOOK_KIND_LABEL, READING_STATUSES, READING_STATUS_LABEL, type Book, type ReadingStatus } from '@/lib/books';
import { api } from '@/lib/client';
import { LEVELS, levelLabel, type LevelInfo } from '@/lib/shared';

type Tab = 'fit' | 'easy' | 'hard' | 'mine' | 'all';

const CODES = LEVELS.map((l) => l.code) as string[];

export default function ReadingClient({ level, initialMarks }: { level: LevelInfo; initialMarks: Record<string, ReadingStatus> }) {
  const [marks, setMarks] = useState(initialMarks);
  const [tab, setTab] = useState<Tab>('fit');
  const [error, setError] = useState('');

  const at = Math.max(0, CODES.indexOf(level.effective));
  const easier = at > 0 ? CODES[at - 1] : null;
  const harder = at < CODES.length - 1 ? CODES[at + 1] : null;
  const marked = Object.keys(marks).length;

  const tabs: { id: Tab; label: string; hint: string }[] = [
    { id: 'fit', label: `正合适 · ${levelLabel(CODES[at])}`, hint: '按你现在的水平，这些书大部分能看懂，又能学到新东西。从这里开始。' },
    ...(easier ? [{ id: 'easy' as Tab, label: `轻松读 · ${levelLabel(easier)}`, hint: '比你的水平低一级，几乎没有生词。用来大量读、练速度和语感，别嫌简单。' }] : []),
    ...(harder ? [{ id: 'hard' as Tab, label: `挑战一下 · ${levelLabel(harder)}`, hint: '比你的水平高一级。挑一本内容熟悉或特别想读的，读不下去就放回去，过一阵再试。' }] : []),
    { id: 'mine', label: `我的书单 ${marked}`, hint: '你标记过的书。' },
    { id: 'all', label: '全部', hint: '按级别从易到难的完整书单。' },
  ];
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  const shown = useMemo(() => {
    if (current.id === 'fit') return BOOKS.filter((b) => b.level === CODES[at]);
    if (current.id === 'easy') return BOOKS.filter((b) => b.level === easier);
    if (current.id === 'hard') return BOOKS.filter((b) => b.level === harder);
    if (current.id === 'mine') {
      const order: ReadingStatus[] = ['reading', 'want', 'done'];
      return BOOKS.filter((b) => marks[b.id]).sort((a, b) => order.indexOf(marks[a.id]) - order.indexOf(marks[b.id]));
    }
    return BOOKS;
  }, [current.id, at, easier, harder, marks]);

  async function mark(book: Book, status: ReadingStatus) {
    const next = marks[book.id] === status ? null : status;
    const before = marks;
    setError('');
    setMarks((prev) => {
      const copy = { ...prev };
      if (next) copy[book.id] = next;
      else delete copy[book.id];
      return copy;
    });
    try {
      await api('/api/reading', { id: book.id, status: next }, 'PUT');
    } catch (e) {
      setMarks(before);
      setError((e as Error).message);
    }
  }

  const count = (s: ReadingStatus) => Object.values(marks).filter((x) => x === s).length;

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>阅读</h1>
        <span className="muted small">
          按"{levelLabel(level.effective)}"水平推荐{level.mode === 'auto' && level.detected ? '（根据最近的日记自动识别）' : ''} · <Link href="/settings">调整水平</Link>
        </span>
        <span className="spacer" />
        {marked > 0 && <span className="muted small">在读 {count('reading')} · 想读 {count('want')} · 读完 {count('done')}</span>}
      </div>

      {error && <div className="banner error" role="alert">{error}</div>}

      <details className="card reading-guide">
        <summary><strong>怎么读才有效：读"刚好看得懂"的书</strong></summary>
        <ul className="points" style={{ marginTop: 10 }}>
          <li><strong>选书看生词量。</strong>随便翻开一页读一遍：不认识的词 0 到 1 个，适合轻松读；2 到 3 个，正合适；5 个以上，现在读太难，先放一放。</li>
          <li><strong>读的时候不查词。</strong>靠上下文猜，猜不出就跳过。同一个词反复出现、又影响理解时再查。读完一章后把想记的词收进生词本。</li>
          <li><strong>量比难度重要。</strong>读十本简单的书比啃一本难的书进步快。读不下去就换一本，不用硬撑。</li>
          <li><strong>选自己感兴趣的。</strong>读过中文版或看过电影的书更容易读进去。</li>
          <li><strong>读完写两句。</strong>在日记里用英语写今天读了什么、有什么想法，读到的表达当天就能用上。</li>
        </ul>
      </details>

      <div className="row" style={{ marginBottom: 6 }}>
        {tabs.map((t) => (
          <button key={t.id} className={`chip ${current.id === t.id ? 'on' : ''}`} aria-pressed={current.id === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="muted small">{current.hint}</p>

      {shown.length === 0 && <div className="card muted">还没有标记任何书。在推荐里点"想读""在读"或"读完"，它们就会出现在这里。</div>}

      <div className="book-grid">
        {shown.map((b) => (
          <div className={`book ${marks[b.id] ?? ''}`} key={b.id}>
            <div className="book-title">{b.title}</div>
            <div className="muted small">{b.zh} · {b.author}</div>
            <div className="row" style={{ gap: 6, margin: '6px 0' }}>
              <span className="badge">{BOOK_KIND_LABEL[b.kind]}</span>
              {b.series && <span className="badge">系列</span>}
              {(current.id === 'all' || current.id === 'mine') && <span className="badge ok">{levelLabel(b.level)}</span>}
            </div>
            <p className="small">{b.note}</p>
            <div className="row book-actions" role="group" aria-label={`${b.title} 的阅读状态`}>
              {READING_STATUSES.map((s) => (
                <button key={s} className={`chip ${marks[b.id] === s ? 'on' : ''}`} aria-pressed={marks[b.id] === s} onClick={() => mark(b, s)}>
                  {READING_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="muted small" style={{ marginTop: 20 }}>
        书单是人工整理的常见读物，分级只是大致判断，以你自己翻开读的感觉为准。本站不提供书的内容，书名可以拿去图书馆、书店或电子书平台搜索。
      </p>
    </>
  );
}
