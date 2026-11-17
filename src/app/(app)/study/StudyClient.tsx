'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, speak, speakable } from '@/lib/client';
import { GRADES, GRADE_LABEL, intervalText, nextState, type Grade } from '@/lib/srs';

export interface Card {
  id: number;
  term: string;
  phonetic: string;
  meaning: string;
  example: string;
  source_sentence: string;
  note: string;
  kind: 'word' | 'phrase';
  interval_days: number;
  ease: number;
  reps: number;
  /** 这一轮里已经答过"忘了"、排到队尾再来的 */
  retry?: boolean;
}

type Mode = 'en' | 'zh';
const MODE_KEY = 'diary-study-mode';

function nextDueText(iso: string) {
  const t = new Date(iso);
  const mins = Math.round((t.getTime() - Date.now()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} 分钟后`;
  const today = new Date();
  const days = Math.round(
    (new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000,
  );
  if (days <= 0) return '今天晚些时候';
  if (days === 1) return '明天';
  return `${days} 天后`;
}

export default function StudyClient({ initial, total, moreNew, nextDue }: { initial: Card[]; total: number; moreNew: number; nextDue: string | null }) {
  const [queue, setQueue] = useState(initial);
  const [shown, setShown] = useState(false);
  const [mode, setMode] = useState<Mode>('en');
  const [done, setDone] = useState(0);
  const [forgot, setForgot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (localStorage.getItem(MODE_KEY) === 'zh') setMode('zh');
  }, []);

  function changeMode(m: Mode) {
    setMode(m);
    setShown(false);
    localStorage.setItem(MODE_KEY, m);
  }

  const card = queue[0];

  async function grade(g: Grade) {
    if (!card || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/vocab/${card.id}/review`, { grade: g });
      const next = nextState(card, g);
      setQueue((q) => (g === 'again' ? [...q.slice(1), { ...card, ...next, retry: true }] : q.slice(1)));
      if (g === 'again') setForgot((n) => n + 1);
      else setDone((n) => n + 1);
      setShown(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 键盘：空格看答案，1/2/3 打分
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ['1', '2', '3'].includes(e.key)) {
        grade(GRADES[Number(e.key) - 1]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const header = (
    <div className="row" style={{ marginBottom: 14 }}>
      <h1 style={{ margin: 0 }}>复习</h1>
      {card && <span className="muted small">还剩 {queue.length} 个</span>}
      <span className="spacer" />
      <div className="tabs" role="tablist" aria-label="复习方式">
        <button role="tab" aria-selected={mode === 'en'} className={mode === 'en' ? 'on' : ''} onClick={() => changeMode('en')}>看英文想意思</button>
        <button role="tab" aria-selected={mode === 'zh'} className={mode === 'zh' ? 'on' : ''} onClick={() => changeMode('zh')}>看中文想英文</button>
      </div>
    </div>
  );

  if (!card) {
    return (
      <>
        {header}
        <div className="card study-done">
          {total === 0 ? (
            <p>生词本和搭配本还是空的。批改日记后把生词和搭配收进来，这里就会按记忆规律安排复习。</p>
          ) : done + forgot > 0 ? (
            <>
              <h2>这一轮复习完了</h2>
              <p>一共过了 {done} 个{forgot > 0 ? `，其中有 ${forgot} 次没想起来，已经重新排过` : ''}。</p>
            </>
          ) : (
            <h2>现在没有要复习的</h2>
          )}
          {total > 0 && moreNew > 0 && <p className="muted">还有 {moreNew} 个新词没开始学，<a href="/study">再来一组</a>。</p>}
          {total > 0 && moreNew === 0 && nextDue && done + forgot === 0 && <p className="muted">下一个要复习的在{nextDueText(nextDue)}。</p>}
          <p style={{ marginBottom: 0 }}><Link href="/">回到日记</Link></p>
        </div>
      </>
    );
  }

  const isNew = !card.retry && card.reps === 0 && card.interval_days === 0;
  // 看中文想英文时，没填意思的词只能直接看英文
  const front = mode === 'zh' && card.meaning ? 'zh' : 'en';

  return (
    <>
      {header}
      {error && <div className="banner error" role="alert">{error}</div>}
      <div className="card study-card">
        <div className="row" style={{ justifyContent: 'center', marginBottom: 6 }}>
          <span className="badge">{card.kind === 'phrase' ? '搭配' : '生词'}</span>
          {isNew && <span className="badge ok">新</span>}
          {card.retry && <span className="badge suggest">再来一次</span>}
        </div>

        {front === 'en' ? (
          <>
            <div className="study-term">{card.term}</div>
            <div className="row" style={{ justifyContent: 'center' }}>
              {card.phonetic && <span className="muted">{card.phonetic}</span>}
              <button className="ghost" onClick={() => speak(speakable(card.term))}>朗读</button>
            </div>
          </>
        ) : (
          <div className="study-meaning">{card.meaning}</div>
        )}

        {!shown ? (
          <div style={{ marginTop: 24 }}>
            <button className="primary" onClick={() => setShown(true)}>看答案</button>
            <div className="muted small" style={{ marginTop: 8 }}>先自己想一下{front === 'en' ? '意思' : '英文怎么说'}，再看答案</div>
          </div>
        ) : (
          <>
            <div className="study-answer">
              {front === 'en' ? (
                <div className="study-meaning">{card.meaning || <span className="muted">（还没填意思）</span>}</div>
              ) : (
                <>
                  <div className="study-term">{card.term}</div>
                  <div className="row" style={{ justifyContent: 'center' }}>
                    {card.phonetic && <span className="muted">{card.phonetic}</span>}
                    <button className="ghost" onClick={() => speak(speakable(card.term))}>朗读</button>
                  </div>
                </>
              )}
              {card.example && <div className="ex">{card.example}</div>}
              {card.note && <div className="small">笔记：{card.note}</div>}
              {card.source_sentence && <div className="muted small">我的原句：{card.source_sentence}</div>}
            </div>
            <div className="study-grades">
              {GRADES.map((g, i) => (
                <button key={g} className={`grade ${g}`} onClick={() => grade(g)} disabled={busy}>
                  <strong>{GRADE_LABEL[g]}</strong>
                  <span className="small">{intervalText(nextState(card, g))}</span>
                  <kbd>{i + 1}</kbd>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <p className="muted small">键盘：空格看答案，1 / 2 / 3 选择。记得越牢，下次出现隔得越久。</p>
    </>
  );
}
