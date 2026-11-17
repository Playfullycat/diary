'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api, speak, speakable } from '@/lib/client';
import { PHRASE_REASON_LABEL, VOCAB_REASON_LABEL, type VocabKind } from '@/lib/shared';

interface Vocab {
  id: number;
  term: string;
  phonetic: string;
  meaning: string;
  example: string;
  source_sentence: string;
  source_type: string;
  entry_id: number | null;
  note: string;
  kind: VocabKind;
}

const EMPTY = { term: '', phonetic: '', meaning: '', example: '' };

const TEXT = {
  word: {
    title: '生词本',
    unit: '个',
    termLabel: '单词或短语',
    termHint: '',
    search: '搜索单词或中文意思',
    empty: '生词本还是空的。日记批改后，AI 会把你用中文代替的词、拼错的词和值得学的表达列出来，点一下就能收进来。',
    none: '没有匹配的生词。',
    labels: VOCAB_REASON_LABEL,
    moveTo: '移到搭配本',
  },
  phrase: {
    title: '搭配本',
    unit: '条',
    termLabel: '固定搭配或句式',
    termHint: 'take sb. home',
    search: '搜索搭配或中文意思',
    empty: '搭配本还是空的。这里收固定搭配和句式，比如 take sb. home（送某人回家）。日记批改后，AI 会把你用错的和值得学的搭配列出来，点一下就能收进来。',
    none: '没有匹配的搭配。',
    labels: PHRASE_REASON_LABEL,
    moveTo: '移到生词本',
  },
} as const;

export default function VocabClient({ initial, kind }: { initial: Vocab[]; kind: VocabKind }) {
  const t = TEXT[kind];
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ meaning: '', example: '', note: '' });
  const [message, setMessage] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (v) =>
        (filter === 'all' || v.source_type === filter) &&
        (!q || v.term.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q)),
    );
  }, [items, query, filter]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      const out = await api<{ vocab: Vocab; existed: boolean }>('/api/vocab', { ...form, kind });
      if (out.existed) {
        setMessage(`"${out.vocab.term}" 已经在${TEXT[out.vocab.kind].title}里了。`);
      } else {
        setItems((prev) => [out.vocab, ...prev]);
        setForm(EMPTY);
        setShowForm(false);
      }
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function saveEdit(id: number) {
    try {
      const out = await api<{ vocab: Vocab }>(`/api/vocab/${id}`, edit, 'PUT');
      setItems((prev) => prev.map((v) => (v.id === id ? out.vocab : v)));
      setEditId(null);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function move(v: Vocab) {
    try {
      await api(`/api/vocab/${v.id}`, { kind: kind === 'word' ? 'phrase' : 'word' }, 'PUT');
      setItems((prev) => prev.filter((x) => x.id !== v.id));
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function remove(v: Vocab) {
    if (!confirm(`从${t.title}删除 "${v.term}"？`)) return;
    try {
      await api(`/api/vocab/${v.id}`, undefined, 'DELETE');
      setItems((prev) => prev.filter((x) => x.id !== v.id));
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>{t.title}</h1>
        <span className="muted small">{items.length} {t.unit}</span>
        <span className="spacer" />
        <button className="primary" onClick={() => setShowForm((s) => !s)}>{showForm ? '取消' : '手动添加'}</button>
      </div>

      {message && <div className="banner warn" role="alert">{message}</div>}

      {showForm && (
        <form className="card" onSubmit={add}>
          <div className="grid2">
            <label className="field"><span>{t.termLabel}</span>
              <input type="text" value={form.term} placeholder={t.termHint} onChange={(e) => setForm({ ...form, term: e.target.value })} required autoFocus />
            </label>
            {kind === 'word' && (
              <label className="field"><span>音标（可不填）</span>
                <input type="text" value={form.phonetic} onChange={(e) => setForm({ ...form, phonetic: e.target.value })} />
              </label>
            )}
            <label className="field"><span>中文意思</span>
              <input type="text" value={form.meaning} placeholder={kind === 'phrase' ? '送某人回家' : ''} onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
            </label>
            <label className="field"><span>例句（可不填）</span>
              <input type="text" value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} />
            </label>
          </div>
          <button className="primary" type="submit">添加</button>
        </form>
      )}

      <div className="row" style={{ marginBottom: 14 }}>
        <input
          type="search"
          placeholder={t.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 280 }}
          aria-label={t.search}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }} aria-label="按来源筛选">
          <option value="all">全部来源</option>
          {Object.entries(t.labels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      {items.length === 0 && <div className="card muted">{t.empty}</div>}
      {items.length > 0 && shown.length === 0 && <p className="muted">{t.none}</p>}

      <div className="vocab-grid">
        {shown.map((v) => (
          <div className="vocab-card" key={v.id}>
            <div className="row">
              <span className="term">{v.term}</span>
              <span className="muted small">{v.phonetic}</span>
              <span className="spacer" />
              <button className="ghost" onClick={() => speak(speakable(v.term))} aria-label={`朗读 ${v.term}`}>朗读</button>
            </div>
            {editId === v.id ? (
              <>
                <label className="field"><span>中文意思</span>
                  <input type="text" value={edit.meaning} onChange={(e) => setEdit({ ...edit, meaning: e.target.value })} />
                </label>
                <label className="field"><span>例句</span>
                  <input type="text" value={edit.example} onChange={(e) => setEdit({ ...edit, example: e.target.value })} />
                </label>
                <label className="field"><span>我的笔记</span>
                  <input type="text" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
                </label>
                <div className="row">
                  <button className="primary" onClick={() => saveEdit(v.id)}>保存</button>
                  <button onClick={() => setEditId(null)}>取消</button>
                </div>
              </>
            ) : (
              <>
                <div>{v.meaning || <span className="muted">（还没填意思）</span>} <span className="badge">{t.labels[v.source_type] ?? VOCAB_REASON_LABEL[v.source_type] ?? v.source_type}</span></div>
                {v.example && <div className="ex">{v.example}</div>}
                {v.note && <div className="small" style={{ marginTop: 4 }}>笔记：{v.note}</div>}
                {v.source_sentence && (
                  <div className="src">
                    我的原句：{v.source_sentence}
                    {v.entry_id && <> <Link href={`/entry/${v.entry_id}`}>查看日记</Link></>}
                  </div>
                )}
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="ghost" onClick={() => { setEditId(v.id); setEdit({ meaning: v.meaning, example: v.example, note: v.note }); }}>编辑</button>
                  <button className="ghost" onClick={() => move(v)}>{t.moveTo}</button>
                  <button className="ghost danger" onClick={() => remove(v)}>删除</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
