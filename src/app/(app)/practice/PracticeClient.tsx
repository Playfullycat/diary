'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { isCorrect, type ExerciseView } from '@/lib/practice';
import { useBusyRefresh } from '@/lib/use-busy';

interface Props {
  groups: { name: string; count: number }[];
  exercises: ExerciseView[];
  entries: { id: number; date: string; state: 'new' | 'ready' | 'done' }[];
  /** 服务器上正在出题 */
  busy: boolean;
  aiReady: boolean;
}

const MAX_FOCUS = 3;
const TRANS_STATE = { new: '还没练', ready: '已生成，还没写', done: '练过' } as const;

export default function PracticeClient({ groups, exercises, entries, busy, aiReady }: Props) {
  const [list, setList] = useState(exercises);
  const [openId, setOpenId] = useState<number | null>(exercises[0]?.id ?? null);
  const [focus, setFocus] = useState(() => groups.slice(0, MAX_FOCUS).map((g) => g.name));
  const [answers, setAnswers] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const waiting = busy || working;
  useBusyRefresh(busy && !working);

  // 等待期间服务器刷新出了新的一组题（比如切走再回来）
  useEffect(() => {
    if (working) return;
    setList(exercises);
    if (exercises[0] && !list.some((x) => x.id === exercises[0].id)) setOpenId(exercises[0].id);
    // 只在服务器数据变化时同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises]);

  const current = list.find((x) => x.id === openId) ?? null;
  const done = !!current?.done_at;

  useEffect(() => {
    setAnswers(current ? current.questions.map((_, i) => current.answers[i] ?? '') : []);
    // 换一组题时重置作答
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  function toggleFocus(name: string) {
    setFocus((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : prev.length >= MAX_FOCUS ? prev : [...prev, name]));
  }

  async function create() {
    setError('');
    setWorking(true);
    try {
      const out = await api<{ exercise: ExerciseView }>('/api/exercises', { focus });
      setList((prev) => [out.exercise, ...prev]);
      setOpenId(out.exercise.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function submit() {
    if (!current) return;
    setError('');
    try {
      const out = await api<{ exercise: ExerciseView }>(`/api/exercises/${current.id}`, { answers }, 'PUT');
      setList((prev) => prev.map((x) => (x.id === out.exercise.id ? out.exercise : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function retry() {
    if (!current) return;
    setList((prev) => prev.map((x) => (x.id === current.id ? { ...x, done_at: null, score: null, answers: [] } : x)));
    setAnswers(current.questions.map(() => ''));
  }

  const answered = answers.filter((a) => a.trim()).length;

  return (
    <>
      <h1 style={{ marginBottom: 14 }}>练习</h1>
      {error && <div className="banner error" role="alert">{error}</div>}

      <div className="card">
        <h2>针对性练习题</h2>
        {groups.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>还没有批改记录。批改几篇日记后，这里可以按你常犯的错误出题。</p>
        ) : (
          <>
            <p className="muted small">按你在日记里常犯的错误出题。选 1 到 {MAX_FOCUS} 类（数字是出现次数）：</p>
            <div className="row" style={{ marginBottom: 12 }}>
              {groups.map((g) => (
                <button key={g.name} className={`chip ${focus.includes(g.name) ? 'on' : ''}`} aria-pressed={focus.includes(g.name)} onClick={() => toggleFocus(g.name)}>
                  {g.name} {g.count}
                </button>
              ))}
            </div>
            <div className="row">
              <button className="primary" onClick={create} disabled={waiting || !aiReady || focus.length === 0}>
                {waiting ? (<><span className="spinner" />正在出题…</>) : '出一组新题'}
              </button>
              <span className="muted small">
                {!aiReady ? <>还没有配置 AI，<Link href="/settings">去设置</Link></> : waiting ? '通常需要 10–40 秒，可以先去别的页面。' : '每组 8 道左右，会调用一次 AI。'}
              </span>
            </div>
          </>
        )}
      </div>

      {current && (
        <div className="card">
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>{done ? `得分 ${current.score} / ${current.questions.length}` : '这组题'}</h2>
            <span className="muted small">{current.focus.join('、')}</span>
          </div>
          {current.questions.map((q, i) => {
            const mine = answers[i] ?? '';
            const right = done && isCorrect(q, mine);
            return (
              <div className={`question ${done ? (right ? 'right' : 'wrong') : ''}`} key={i}>
                <div className="q-prompt"><span className="muted small">{i + 1}</span><span className="en">{q.prompt}</span></div>
                {q.kind === 'choice' ? (
                  <div className="q-options" role="radiogroup" aria-label={`第 ${i + 1} 题`}>
                    {q.options.map((o) => (
                      <label key={o} className={`q-option ${mine === o ? 'picked' : ''} ${done && o === q.answer ? 'answer' : ''}`}>
                        <input type="radio" name={`q-${current.id}-${i}`} checked={mine === o} disabled={done} onChange={() => setAnswers((p) => p.map((a, k) => (k === i ? o : a)))} />
                        <span className="en">{o}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    className="q-fill"
                    lang="en"
                    spellCheck={false}
                    autoComplete="off"
                    value={mine}
                    disabled={done}
                    placeholder="填空里的词"
                    aria-label={`第 ${i + 1} 题的答案`}
                    onChange={(e) => setAnswers((p) => p.map((a, k) => (k === i ? e.target.value : a)))}
                  />
                )}
                {done && (
                  <div className="q-result">
                    <span className={`badge ${right ? 'ok' : 'must'}`}>{right ? '对了' : mine.trim() ? '错了' : '没答'}</span>
                    {!right && <> 正确答案：<strong className="en">{q.answer}</strong></>}
                    <div className="small" style={{ marginTop: 4 }}>{q.explanation}{q.category && <span className="muted">（{q.category}）</span>}</div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 14 }}>
            {done ? (
              <button onClick={retry}>再做一遍</button>
            ) : (
              <button className="primary" onClick={submit} disabled={answered === 0}>交卷</button>
            )}
            {!done && <span className="muted small">已答 {answered} / {current.questions.length}</span>}
          </div>
        </div>
      )}

      {list.length > 1 && (
        <div className="card">
          <h2>做过的练习</h2>
          {list.map((x) => (
            <button key={x.id} className={`history-item ${x.id === openId ? 'on' : ''}`} onClick={() => { setOpenId(x.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              <span>{new Date(x.created_at).toLocaleDateString('zh-CN')}</span>
              <span className="muted small">{x.focus.join('、')}</span>
              <span className="spacer" />
              <span className={`badge ${x.done_at ? 'ok' : ''}`}>{x.done_at ? `${x.score} / ${x.questions.length}` : '还没做'}</span>
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <h2>回译练习</h2>
        <p className="muted small">看着中文把自己日记的修改版写回英文，检验是不是真的掌握了。</p>
        {entries.length === 0 && <p className="muted" style={{ marginBottom: 0 }}>还没有批改过的日记。</p>}
        {entries.map((e) => (
          <Link key={e.id} href={`/entry/${e.id}/translate`} className="history-item">
            <span>{e.date} 的日记</span>
            <span className="spacer" />
            <span className={`badge ${e.state === 'done' ? 'ok' : ''}`}>{TRANS_STATE[e.state]}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
