'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, speak } from '@/lib/client';
import { VERDICT_LABEL, diffWords, type TranslationView } from '@/lib/practice';
import { useBusyRefresh } from '@/lib/use-busy';

interface Props {
  entryId: number;
  date: string;
  reviewed: boolean;
  translation: TranslationView | null;
  /** 服务器上正在为这篇生成中文或点评 */
  busy: boolean;
  aiReady: boolean;
}

const VERDICT_CLASS = { good: 'ok', minor: 'suggest', wrong: 'must' } as const;

export default function TranslateClient({ entryId, date, reviewed, translation, busy, aiReady }: Props) {
  const [tr, setTr] = useState(translation);
  const [answers, setAnswers] = useState<string[]>(translation?.answers ?? []);
  // 上次已经写过译文的，回来时直接显示对照
  const [revealed, setRevealed] = useState(!!translation?.answers.some(Boolean));
  const [working, setWorking] = useState<'' | 'create' | 'feedback'>('');
  const [error, setError] = useState('');
  const waiting = busy || working !== '';
  useBusyRefresh(busy && working === '');

  // 等待期间服务器刷新出了新结果（比如切走再回来）
  useEffect(() => {
    if (working !== '') return;
    setTr(translation);
    if (translation && !tr) setAnswers(translation.answers);
    if (translation?.feedback.some(Boolean)) setRevealed(true);
    // 只在服务器数据变化时同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation]);

  const url = `/api/entries/${entryId}/translation`;

  async function create() {
    setError('');
    setWorking('create');
    try {
      const out = await api<{ translation: TranslationView }>(url, { action: 'create' });
      setTr(out.translation);
      setAnswers(out.translation.answers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking('');
    }
  }

  async function reveal() {
    setError('');
    setRevealed(true);
    try {
      const out = await api<{ translation: TranslationView }>(url, { answers }, 'PUT');
      setTr(out.translation);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function askFeedback() {
    setError('');
    setWorking('feedback');
    try {
      const out = await api<{ translation: TranslationView }>(url, { action: 'feedback', answers });
      setTr(out.translation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking('');
    }
  }

  async function restart() {
    if (!confirm('清空这次写的译文，重新练一遍？')) return;
    const empty = answers.map(() => '');
    setAnswers(empty);
    setRevealed(false);
    try {
      const out = await api<{ translation: TranslationView }>(url, { answers: empty }, 'PUT');
      setTr(out.translation);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const head = (
    <div className="row" style={{ marginBottom: 14 }}>
      <Link href={`/entry/${entryId}`} className="muted">← 回到日记</Link>
      <h1 style={{ margin: 0 }}>回译练习</h1>
      <span className="muted small">{date}</span>
    </div>
  );

  if (!reviewed) {
    return (
      <>
        {head}
        <div className="card muted">这篇日记还没有批改。先<Link href={`/entry/${entryId}`}>去批改</Link>，再回来做回译。</div>
      </>
    );
  }

  if (!tr) {
    return (
      <>
        {head}
        {error && <div className="banner error" role="alert">{error}</div>}
        <div className="card">
          <p>回译是把学过的句子变成自己的：AI 先把这篇日记的修改版逐句翻成中文，你看着中文把它写回英文，再和修改版对照，看哪些地方还没掌握。</p>
          <div className="row">
            <button className="primary" onClick={create} disabled={waiting || !aiReady}>
              {waiting ? (<><span className="spinner" />正在生成中文…</>) : '开始练习'}
            </button>
            <span className="muted small">
              {!aiReady ? <>还没有配置 AI，<Link href="/settings">去设置</Link></> : waiting ? '通常需要 10–30 秒，可以先去别的页面。' : '会调用一次 AI，生成后保存下来，以后再练不用重新生成。'}
            </span>
          </div>
        </div>
      </>
    );
  }

  const answered = answers.filter((a) => a.trim()).length;
  const hasFeedback = tr.feedback.some(Boolean);

  return (
    <>
      {head}
      {error && <div className="banner error" role="alert">{error}</div>}
      <p className="muted">
        看着中文写出英文。不用和参考一模一样，意思对、语法对就行。{!revealed && '写完点最下面的"对照答案"。'}
      </p>

      {tr.sentences.map((s, i) => {
        const mine = answers[i] ?? '';
        const diff = revealed && mine.trim() ? diffWords(mine, s.en) : null;
        const fb = tr.feedback[i];
        return (
          <div className="card trans-item" key={i}>
            <div className="trans-zh"><span className="muted small">{i + 1}</span>{s.zh}</div>
            <textarea
              className="trans-input"
              rows={2}
              lang="en"
              spellCheck={false}
              value={mine}
              placeholder="写出这句的英文"
              onChange={(e) => setAnswers((prev) => prev.map((a, k) => (k === i ? e.target.value : a)))}
            />
            {revealed && (
              <div className="trans-ref">
                <div className="row">
                  <span className="muted small">参考</span>
                  <span className="spacer" />
                  <button className="ghost" onClick={() => speak(s.en)}>朗读</button>
                </div>
                <div className="en">
                  {diff ? diff.ref.map((t, k) => <span key={k}><span className={t.changed ? 'diff-add' : ''}>{t.text}</span> </span>) : s.en}
                </div>
                {diff && diff.mine.some((t) => t.changed) && (
                  <div className="en muted" style={{ fontSize: 15 }}>
                    你写的：{diff.mine.map((t, k) => <span key={k}><span className={t.changed ? 'diff-del' : ''}>{t.text}</span> </span>)}
                  </div>
                )}
                {diff && !diff.mine.some((t) => t.changed) && !diff.ref.some((t) => t.changed) && (
                  <div className="small" style={{ color: 'var(--accent)' }}>和参考一样。</div>
                )}
                {fb && (
                  <div className="trans-fb">
                    <span className={`badge ${VERDICT_CLASS[fb.verdict]}`}>{VERDICT_LABEL[fb.verdict]}</span> {fb.comment}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="row" style={{ margin: '16px 0' }}>
        {!revealed ? (
          <button className="primary" onClick={reveal} disabled={answered === 0}>对照答案</button>
        ) : (
          <>
            <button className="primary" onClick={askFeedback} disabled={waiting || answered === 0 || !aiReady}>
              {waiting ? (<><span className="spinner" />AI 正在点评…</>) : hasFeedback ? '重新点评' : '让 AI 点评'}
            </button>
            <button onClick={restart} disabled={waiting}>重新练一遍</button>
          </>
        )}
        <span className="muted small">
          {!revealed
            ? `已写 ${answered} / ${tr.sentences.length} 句，不会的可以先空着。`
            : waiting
              ? '通常需要 10–30 秒。'
              : '标出来的词只是和参考不一样，不一定是错；拿不准时让 AI 点评（会调用一次 AI）。'}
        </span>
      </div>
    </>
  );
}
