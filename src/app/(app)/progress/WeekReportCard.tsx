'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { addDays, type WeekReport, type WeekStats } from '@/lib/practice';
import { useBusyRefresh } from '@/lib/use-busy';

interface Saved {
  report: WeekReport;
  created_at: string;
  model: string | null;
}

interface Props {
  stats: WeekStats;
  previous: WeekStats;
  saved: Saved | null;
  isThisWeek: boolean;
  /** 服务器上正在生成这一周的小结 */
  busy: boolean;
  aiReady: boolean;
}

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

/** 和上周比的变化；lowerIsBetter 时下降才是好事 */
function Delta({ now, before, digits = 0, lowerIsBetter = false }: { now: number | null; before: number | null; digits?: number; lowerIsBetter?: boolean }) {
  if (now === null || before === null) return null;
  const diff = now - before;
  if (Math.abs(diff) < 10 ** -digits / 2) return <span className="delta">和上周一样</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return <span className={`delta ${good ? 'good' : ''}`}>比上周{diff > 0 ? '多' : '少'} {Math.abs(diff).toFixed(digits)}</span>;
}

export default function WeekReportCard({ stats, previous, saved, isThisWeek, busy, aiReady }: Props) {
  const [report, setReport] = useState(saved);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const waiting = busy || working;
  useBusyRefresh(busy && !working);

  // 等待期间服务器刷新出了结果（比如切走再回来）
  useEffect(() => {
    if (!working) setReport(saved);
    // 只在服务器数据变化时同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  async function generate() {
    setError('');
    setWorking(true);
    try {
      const out = await api<{ report: Saved }>('/api/reports', { week: stats.start });
      setReport(out.report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const hasPrev = previous.entries > 0;
  const empty = stats.entries === 0;

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{isThisWeek ? '本周' : '周报'}</h2>
        <span className="muted small">{md(stats.start)} – {md(stats.end)}</span>
        <span className="spacer" />
        <Link className="btn" href={`/progress?week=${addDays(stats.start, -7)}`} scroll={false}>← 上一周</Link>
        {isThisWeek ? (
          <button disabled>下一周 →</button>
        ) : (
          <Link className="btn" href={`/progress?week=${addDays(stats.start, 7)}`} scroll={false}>下一周 →</Link>
        )}
      </div>

      {error && <div className="banner error" role="alert">{error}</div>}

      {empty ? (
        <p className="muted" style={{ marginBottom: 0 }}>这一周没有写日记。</p>
      ) : (
        <>
          <div className="week-stats">
            <div className="stat"><b>{stats.days}<small> / 7 天</small></b><span className="muted small">写了日记</span>{hasPrev && <Delta now={stats.days} before={previous.days} />}</div>
            <div className="stat"><b>{stats.words}</b><span className="muted small">词</span>{hasPrev && <Delta now={stats.words} before={previous.words} />}</div>
            <div className="stat">
              <b>{stats.rate === null ? '–' : stats.rate.toFixed(1)}</b>
              <span className="muted small">每 100 词必须改的错误</span>
              {hasPrev && <Delta now={stats.rate} before={previous.rate} digits={1} lowerIsBetter />}
            </div>
            <div className="stat"><b>{stats.newWords + stats.newPhrases}</b><span className="muted small">新收的生词和搭配</span></div>
          </div>

          {stats.top.length > 0 && (
            <p className="small" style={{ marginTop: 12 }}>
              <span className="muted">这周最常见的问题：</span>
              {stats.top.map((t) => `${t.name} ${t.count} 次`).join('、')}
              　<Link href="/mistakes">去错题本看</Link>
            </p>
          )}

          <div className="week-ai">
            {report ? (
              <>
                <p>{report.report.summary}</p>
                {report.report.strengths.length > 0 && (
                  <>
                    <strong>做得好的</strong>
                    <ul className="points">{report.report.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </>
                )}
                {report.report.focus.length > 0 && (
                  <>
                    <strong>下周注意</strong>
                    <ul className="points">{report.report.focus.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </>
                )}
                {report.report.suggestion && <p style={{ marginTop: 8 }}><strong>小练习：</strong>{report.report.suggestion}</p>}
              </>
            ) : (
              <p className="muted" style={{ marginBottom: 8 }}>
                {stats.reviewed === 0 ? '这周的日记还没有批改，批改后小结会更具体。' : '可以让 AI 根据这周的数据和错误写一份小结。'}
              </p>
            )}
            <div className="row">
              <button className={report ? '' : 'primary'} onClick={generate} disabled={waiting || !aiReady}>
                {waiting ? (<><span className="spinner" />正在写小结…</>) : report ? '重新生成' : '生成 AI 小结'}
              </button>
              <span className="muted small">
                {!aiReady ? (
                  <>还没有配置 AI，<Link href="/settings">去设置</Link></>
                ) : waiting ? (
                  '通常需要 10–30 秒，可以先去别的页面。'
                ) : report ? (
                  `生成于 ${new Date(report.created_at).toLocaleString('zh-CN')}${isThisWeek ? '，这周又写了新日记可以重新生成' : ''}`
                ) : (
                  '会调用一次 AI。'
                )}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
