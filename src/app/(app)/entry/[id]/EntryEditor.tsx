'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, speak, speakable, stopSpeaking } from '@/lib/client';
import {
  ISSUE_TYPE_LABEL, PHRASE_REASON_LABEL, SEVERITY_LABEL, VOCAB_REASON_LABEL, countWords, levelLabel,
  type Issue, type LevelInfo, type PhraseSuggestion, type ReviewView, type VocabSuggestion,
} from '@/lib/shared';

interface Props {
  entry: { id: number; date: string; content: string; updated_at: string };
  initialReview: ReviewView | null;
  /** 打开页面时服务器上是否正在批改这篇 */
  initialReviewing: boolean;
  initialLevel: LevelInfo;
  vocabKeys: string[];
  aiReady: boolean;
  topic: { en: string; zh: string; hints: string[] };
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface ReviewStatus {
  reviewing: boolean;
  review?: ReviewView | null;
  level?: LevelInfo;
  error?: string | null;
}

/** 把原文按批改意见切成普通文字和高亮片段 */
const WORD_CHAR = /[A-Za-z0-9']/;

/** 找片段的位置；片段以字母开头或结尾时按整词匹配，免得 "is" 标到 "this" 里 */
function locate(text: string, needle: string, from: number) {
  const headWord = WORD_CHAR.test(needle[0] ?? '');
  const tailWord = WORD_CHAR.test(needle[needle.length - 1] ?? '');
  let at = text.indexOf(needle, from);
  while (at >= 0) {
    const end = at + needle.length;
    const headOk = !headWord || at === 0 || !WORD_CHAR.test(text[at - 1]);
    const tailOk = !tailWord || end >= text.length || !WORD_CHAR.test(text[end]);
    if (headOk && tailOk) return at;
    at = text.indexOf(needle, at + 1);
  }
  return -1;
}

function segment(text: string, issues: Issue[]) {
  const ranges: { start: number; end: number; idx: number }[] = [];
  let cursor = 0;
  issues.forEach((it, idx) => {
    let at = locate(text, it.original, cursor);
    if (at < 0) at = locate(text, it.original, 0);
    if (at < 0) at = text.indexOf(it.original);
    if (at < 0) return;
    const end = at + it.original.length;
    if (ranges.some((r) => at < r.end && end > r.start)) return;
    ranges.push({ start: at, end, idx });
    cursor = Math.max(cursor, end);
  });
  ranges.sort((a, b) => a.start - b.start);
  const parts: { text: string; idx: number | null }[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) parts.push({ text: text.slice(pos, r.start), idx: null });
    parts.push({ text: text.slice(r.start, r.end), idx: r.idx });
    pos = r.end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), idx: null });
  return parts;
}

export default function EntryEditor({ entry, initialReview, initialReviewing, initialLevel, vocabKeys, aiReady, topic }: Props) {
  const router = useRouter();
  const draftKey = `diary-draft-${entry.id}`;
  const [content, setContent] = useState(entry.content);
  const [date, setDate] = useState(entry.date);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [review, setReview] = useState(initialReview);
  const [level, setLevel] = useState(initialLevel);
  const [editing, setEditing] = useState(!initialReview || initialReview.original_text !== entry.content);
  const [reviewing, setReviewing] = useState(initialReviewing);
  // 每次加一就向服务器问一次批改进度
  const [statusCheck, setStatusCheck] = useState(0);
  const [floating, setFloating] = useState(false);
  const [floatOpen, setFloatOpen] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'corrected' | 'polished'>('corrected');
  const [active, setActive] = useState<number | null>(null);
  const [added, setAdded] = useState(() => new Set(vocabKeys));
  const [speaking, setSpeaking] = useState(false);
  const saved = useRef(entry.content);
  const latest = useRef(entry.content);
  latest.current = content;
  const reviewId = useRef(initialReview?.id ?? 0);
  const submitting = useRef(false);
  const origRef = useRef<HTMLDivElement>(null);
  const issuesRef = useRef<HTMLDivElement>(null);
  const floatBody = useRef<HTMLDivElement>(null);

  // 找回上次没来得及保存到服务器的草稿
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { t: number; content: string };
      if (draft.content !== entry.content && draft.t > new Date(entry.updated_at).getTime()) {
        setContent(draft.content);
        setEditing(true);
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch {
      // 草稿损坏就忽略
    }
    return () => stopSpeaking();
  }, [draftKey, entry.content, entry.updated_at]);

  const save = useCallback(async () => {
    const sending = latest.current;
    if (sending === saved.current) return;
    setSaveState('saving');
    try {
      await api(`/api/entries/${entry.id}`, { content: sending }, 'PUT');
      saved.current = sending;
      if (latest.current === sending) {
        localStorage.removeItem(draftKey);
        setSaveState('saved');
      }
    } catch {
      setSaveState('error');
    }
  }, [entry.id, draftKey]);

  useEffect(() => {
    if (content === saved.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ t: Date.now(), content }));
    } catch {
      // 本地存储不可用时仍然会自动保存到服务器
    }
    setSaveState('dirty');
    const timer = setTimeout(save, 1200);
    return () => clearTimeout(timer);
  }, [content, draftKey, save]);

  async function changeDate(value: string) {
    if (!value) return;
    setDate(value);
    try {
      await api(`/api/entries/${entry.id}`, { date: value }, 'PUT');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const showReview = useCallback((next: ReviewView, nextLevel?: LevelInfo) => {
    reviewId.current = next.id;
    setReview(next);
    if (nextLevel) setLevel(nextLevel);
    setActive(null);
    setTab('corrected');
    // 等批改的时候又改过日记，就留在编辑状态
    if (latest.current === next.original_text) {
      saved.current = next.original_text;
      localStorage.removeItem(draftKey);
      setSaveState('saved');
      setEditing(false);
    }
  }, [draftKey]);

  // 批改在服务器上进行。提交后切到别的页面再回来，这个组件是全新的，
  // 所以打开时先问一次进度；还在批改就每隔几秒再问，直到出结果。
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let waited = false;
    async function tick() {
      let s: ReviewStatus | null = null;
      try {
        s = await api<ReviewStatus>(`/api/entries/${entry.id}/review`, undefined, 'GET');
      } catch {
        // 网络抖动：下面接着重试
      }
      if (stop || submitting.current) return;
      if (!s || s.reviewing) {
        if (s) {
          waited = true;
          setReviewing(true);
        }
        if (s || waited) timer = setTimeout(tick, 2500);
        return;
      }
      setReviewing(false);
      if (s.review && s.review.id > reviewId.current) showReview(s.review, s.level);
      else if (s.error && (waited || statusCheck === 0)) setError(s.error);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [entry.id, statusCheck, showReview]);

  async function submitReview() {
    if (submitting.current) return;
    submitting.current = true;
    setError('');
    setReviewing(true);
    try {
      const out = await api<{ review: ReviewView; level: LevelInfo }>(`/api/entries/${entry.id}/review`, { content });
      showReview(out.review, out.level);
      setReviewing(false);
    } catch (e) {
      setError((e as Error).message);
      // 可能是这篇已经在批改了（比如在另一个标签页提交的），按服务器的状态为准
      setStatusCheck((n) => n + 1);
    } finally {
      submitting.current = false;
    }
  }

  async function remove() {
    if (!confirm('确定删除这篇日记吗？批改记录也会一起删除。')) return;
    try {
      await api(`/api/entries/${entry.id}`, undefined, 'DELETE');
      localStorage.removeItem(draftKey);
      router.push('/');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addPhrase(p: PhraseSuggestion) {
    try {
      await api('/api/vocab', {
        term: p.pattern,
        meaning: p.meaning,
        example: p.example,
        source_sentence: p.source,
        source_type: p.reason,
        entry_id: entry.id,
        kind: 'phrase',
      });
      setAdded((prev) => new Set(prev).add(p.pattern.toLowerCase()));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addVocab(v: VocabSuggestion) {
    try {
      await api('/api/vocab', {
        term: v.term,
        phonetic: v.phonetic,
        meaning: v.meaning,
        example: v.example,
        source_sentence: v.source,
        source_type: v.reason,
        entry_id: entry.id,
      });
      setAdded((prev) => new Set(prev).add(v.term.toLowerCase()));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function focusIssue(idx: number) {
    setActive(idx);
    document.getElementById(`issue-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function toggleSpeak(text: string) {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (speak(text)) {
      setSpeaking(true);
      const check = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          setSpeaking(false);
          clearInterval(check);
        }
      }, 500);
    }
  }

  const result = review?.result;
  const parts = useMemo(() => (review ? segment(review.original_text, review.result.issues) : []), [review]);
  const hasReview = !!review;

  // 原文滚出屏幕、而修改说明还在屏幕里时，把原文浮在顶部
  useEffect(() => {
    if (!hasReview) return;
    function update() {
      const orig = origRef.current?.getBoundingClientRect();
      const list = issuesRef.current?.getBoundingClientRect();
      setFloating(!!orig && !!list && orig.bottom < 0 && list.bottom > 200);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [hasReview]);

  // 浮动原文里，把当前选中的那处滚到看得见的位置
  useEffect(() => {
    const body = floatBody.current;
    if (!floating || !floatOpen || active === null || !body) return;
    const mark = body.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    if (mark) body.scrollTop = mark.offsetTop - body.clientHeight / 2 + mark.offsetHeight / 2;
  }, [active, floating, floatOpen]);

  const originalMarks = result
    ? parts.map((p, i) =>
        p.idx === null ? (
          <span key={i}>{p.text}</span>
        ) : (
          <mark
            key={i}
            data-idx={p.idx}
            className={`hl ${result.issues[p.idx].severity} ${active === p.idx ? 'active' : ''}`}
            onClick={() => focusIssue(p.idx!)}
            title={result.issues[p.idx].corrected}
          >
            {p.text}
          </mark>
        ),
      )
    : null;
  const phrases = result?.phrases ?? [];
  const stale = !!review && review.original_text !== content;
  const words = countWords(content);
  const levelHint =
    level.mode === 'manual' && level.detected && level.detected !== level.chosen
      ? `你最近几篇的写作接近"${levelLabel(level.detected)}"水平，当前设置是"${levelLabel(level.chosen)}"。`
      : '';
  const rightText = result ? (tab === 'polished' && result.polished_text ? result.polished_text : result.corrected_text) : '';

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link href="/" className="muted">← 返回</Link>
        <input
          type="date"
          className="date-input"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          aria-label="日记日期"
        />
        <span className="muted small">{words} 词</span>
        <span className="spacer" />
        <span className="small muted" aria-live="polite">
          {saveState === 'saved' && '已保存'}
          {saveState === 'dirty' && '未保存…'}
          {saveState === 'saving' && '保存中…'}
          {saveState === 'error' && <span style={{ color: 'var(--must)' }}>保存失败，草稿留在本机，联网后会自动重试</span>}
        </span>
        {saveState === 'error' && <button onClick={save}>重试保存</button>}
        <button className="ghost danger" onClick={remove}>删除</button>
      </div>

      {error && <div className="banner error" role="alert">{error}</div>}

      {floating && result && (
        <div className="orig-float">
          <div className="orig-float-inner">
            <div className="row">
              <strong className="small">原文</strong>
              <span className="muted small">点高亮处可以跳到对应的说明</span>
              <span className="spacer" />
              <button className="ghost" onClick={() => setFloatOpen((o) => !o)}>{floatOpen ? '收起' : '展开'}</button>
            </div>
            {floatOpen && <div className="en orig-float-body" ref={floatBody}>{originalMarks}</div>}
          </div>
        </div>
      )}

      {editing && (
        <>
          {!content.trim() && (
            <div className="banner info">
              今日话题：<span className="en" style={{ fontSize: 15 }}>{topic.en}</span>（{topic.zh}）可以写：{topic.hints.join('、')}。
              不会的词直接写中文。
            </div>
          )}
          <textarea
            className="editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Today I ... （不会的词直接写中文，比如：I went to the 超市 to buy some 蔬菜.）"
            spellCheck={false}
            autoFocus={!entry.content}
            lang="en"
          />
          <div className="row" style={{ margin: '12px 0 20px' }}>
            <button className="primary" onClick={submitReview} disabled={reviewing || !content.trim() || !aiReady}>
              {reviewing ? (<><span className="spinner" />AI 正在批改…</>) : review ? '重新批改' : '提交批改'}
            </button>
            {review && !stale && <button onClick={() => setEditing(false)}>收起编辑</button>}
            <span className="muted small">
              {!aiReady ? (
                <>还没有配置 AI，<Link href="/settings">去设置</Link></>
              ) : reviewing ? (
                '通常需要 10–60 秒。日记已经保存，可以先去别的页面，回来还能看到结果。'
              ) : (
                `按"${levelLabel(level.effective)}"水平批改${level.mode === 'auto' ? '（自动识别）' : ''}`
              )}
            </span>
          </div>
        </>
      )}

      {result && review && (
        <>
          {stale && <div className="banner warn">日记在批改后修改过，下面是上一次的批改结果。</div>}
          {levelHint && (
            <div className="banner info">{levelHint}<Link href="/settings">去调整</Link></div>
          )}

          {(result.praise || result.key_points.length > 0) && (
            <div className="card">
              {result.praise && <p><strong>写得好的地方：</strong>{result.praise}</p>}
              {result.key_points.length > 0 && (
                <>
                  <strong>这篇最值得记住的：</strong>
                  <ul className="points">
                    {result.key_points.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}

          <div className="compare">
            <div className="pane" ref={origRef}>
              <div className="pane-head">
                <h3>原文</h3>
                <span className="spacer" />
                {!editing && <button onClick={() => setEditing(true)}>修改日记</button>}
              </div>
              <div className="en">{originalMarks}</div>
            </div>
            <div className="pane">
              <div className="pane-head">
                <div className="tabs" role="tablist">
                  <button role="tab" aria-selected={tab === 'corrected'} className={tab === 'corrected' ? 'on' : ''} onClick={() => setTab('corrected')}>修改版</button>
                  {result.polished_text && (
                    <button role="tab" aria-selected={tab === 'polished'} className={tab === 'polished' ? 'on' : ''} onClick={() => setTab('polished')}>润色版</button>
                  )}
                </div>
                <span className="spacer" />
                {!stale && <Link className="btn" href={`/entry/${entry.id}/translate`}>回译练习</Link>}
                <button onClick={() => toggleSpeak(rightText)}>{speaking ? '停止' : '朗读'}</button>
              </div>
              <div className="en">{rightText}</div>
              <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
                {tab === 'corrected' ? '只改了必须改的地方，保留你自己的写法。' : '同样的内容，更自然的写法，可以作为模仿的目标。'}
              </p>
            </div>
          </div>

          <div className="row" style={{ margin: '20px 0 10px' }}>
            <h2 style={{ margin: 0 }}>修改说明（{result.issues.length}）</h2>
            <span className="spacer" />
            <div className="legend">
              <span><i style={{ background: 'var(--must)' }} />必须改</span>
              <span><i style={{ background: 'var(--suggest)' }} />建议改</span>
              <span><i style={{ background: 'var(--advanced)' }} />进阶表达</span>
            </div>
          </div>
          {result.issues.length === 0 && <div className="banner ok">这篇没有需要改的地方，写得很好。</div>}
          <div ref={issuesRef}>
          {result.issues.map((it, idx) => (
            <div
              key={idx}
              id={`issue-${idx}`}
              className={`issue ${it.severity} ${active === idx ? 'active' : ''}`}
              onClick={() => setActive(idx)}
            >
              <div className="row">
                <span className={`badge ${it.severity}`}>{SEVERITY_LABEL[it.severity]}</span>
                <span className="badge">{ISSUE_TYPE_LABEL[it.type]}{it.category && it.category !== ISSUE_TYPE_LABEL[it.type] ? ` · ${it.category}` : ''}</span>
              </div>
              <div className="change">
                <del>{it.original}</del> → <ins>{it.corrected}</ins>
              </div>
              <p>{it.explanation}</p>
            </div>
          ))}
          </div>

          {result.vocab.length > 0 && (
            <>
              <h2 style={{ margin: '24px 0 10px' }}>值得收进生词本的</h2>
              <div className="vocab-grid">
                {result.vocab.map((v, i) => {
                  const has = added.has(v.term.toLowerCase());
                  return (
                    <div className="vocab-card" key={i}>
                      <div className="row">
                        <span className="term">{v.term}</span>
                        <span className="muted small">{v.phonetic}</span>
                        <span className="spacer" />
                        <button className="ghost" onClick={() => speak(v.term)} aria-label={`朗读 ${v.term}`}>朗读</button>
                      </div>
                      <div>{v.meaning} <span className="badge">{VOCAB_REASON_LABEL[v.reason]}</span></div>
                      {v.example && <div className="ex">{v.example}</div>}
                      <div style={{ marginTop: 8 }}>
                        <button onClick={() => addVocab(v)} disabled={has}>{has ? '已在生词本' : '加入生词本'}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {phrases.length > 0 && (
            <>
              <h2 style={{ margin: '24px 0 10px' }}>值得收进搭配本的</h2>
              <div className="vocab-grid">
                {phrases.map((p, i) => {
                  const has = added.has(p.pattern.toLowerCase());
                  return (
                    <div className="vocab-card" key={i}>
                      <div className="row">
                        <span className="term">{p.pattern}</span>
                        <span className="spacer" />
                        <button className="ghost" onClick={() => speak(speakable(p.pattern))} aria-label={`朗读 ${p.pattern}`}>朗读</button>
                      </div>
                      <div>{p.meaning} <span className="badge">{PHRASE_REASON_LABEL[p.reason]}</span></div>
                      {p.example && <div className="ex">{p.example}</div>}
                      <div style={{ marginTop: 8 }}>
                        <button onClick={() => addPhrase(p)} disabled={has}>{has ? '已在搭配本' : '加入搭配本'}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <p className="muted small" style={{ marginTop: 24 }}>
            批改于 {new Date(review.created_at).toLocaleString('zh-CN')}
            {review.model ? ` · ${review.model}` : ''}
            {result.level_estimate ? ` · 本篇水平估计：${levelLabel(result.level_estimate)}` : ''}
            。AI 也会出错，有疑问的地方可以多查一下。
          </p>
        </>
      )}
    </>
  );
}
