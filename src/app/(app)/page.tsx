import Link from 'next/link';
import { backupHealth } from '@/lib/backup';
import { all, get, localDate, nowIso } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { countWords } from '@/lib/shared';
import { topicFor } from '@/lib/topics';
import NewEntryButton from './NewEntryButton';
import StreakCalendar, { streaks, type DayStat } from './StreakCalendar';

interface Row {
  id: number;
  date: string;
  content: string;
  reviewed: number;
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export default function Home() {
  const today = localDate();
  const entries = all<Row>(
    `SELECT e.id, e.date, e.content,
            EXISTS(SELECT 1 FROM reviews r WHERE r.entry_id = e.id) AS reviewed
     FROM entries e WHERE trim(e.content) != '' ORDER BY e.date DESC, e.id DESC`,
  );
  const vocabCount = get<{ n: number }>('SELECT COUNT(*) AS n FROM vocab')?.n ?? 0;
  const dueCount = get<{ n: number }>('SELECT COUNT(*) AS n FROM vocab WHERE due_at IS NULL OR due_at <= ?', nowIso())?.n ?? 0;
  // 一天写了多篇时，词数相加，点日历格子打开最新的一篇
  const dayMap = new Map<string, DayStat>();
  for (const e of entries) {
    const day = dayMap.get(e.date);
    if (day) day.words += countWords(e.content);
    else dayMap.set(e.date, { date: e.date, words: countWords(e.content), entryId: e.id });
  }
  const days = [...dayMap.values()];
  const streak = streaks(days.map((d) => d.date), today);
  const health = backupHealth();
  const aiReady = !!getSetting('ai_api_key');
  const topic = topicFor(today);
  const wroteToday = entries.some((e) => e.date === today);

  return (
    <>
      {!aiReady && (
        <div className="banner info">
          还没有配置 AI，现在可以写日记，但不能批改。<Link href="/settings">去设置</Link>
        </div>
      )}
      {health.warning && (
        <div className="banner warn" role="alert">
          {health.warning}<Link href="/settings#backup">查看备份状态</Link>
        </div>
      )}

      <div className="stats">
        <div className="stat"><b>{entries.length}</b><span className="muted small">篇日记</span></div>
        <div className="stat"><b>{streak.current}</b><span className="muted small">连续天数{streak.longest > streak.current ? ` · 最长 ${streak.longest}` : ''}</span></div>
        <div className="stat"><b>{vocabCount}</b><span className="muted small">个生词和搭配</span></div>
        <Link href="/study" className={`stat ${dueCount > 0 ? 'due' : ''}`}>
          <b>{dueCount}</b><span className="muted small">{dueCount > 0 ? '个待复习，去复习 →' : '个待复习'}</span>
        </Link>
      </div>

      <div className="card prompt-card">
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="small muted">今日话题 · 不知道写什么可以从这里开始</div>
            <div className="en">{topic.en}</div>
            <div className="small muted">{topic.zh}　可以写：{topic.hints.join('、')}</div>
          </div>
          <NewEntryButton label={wroteToday ? '再写一篇' : '写今天的日记'} />
        </div>
      </div>

      {entries.length > 0 && <StreakCalendar days={days} today={today} />}

      <div className="card">
        <h2>我的日记</h2>
        {entries.length === 0 && (
          <p className="muted">还没有日记。不会的词直接写中文就行，写完让 AI 帮你改。</p>
        )}
        {entries.map((e) => (
          <Link key={e.id} href={`/entry/${e.id}`} className="entry-item">
            <div className="row">
              <strong>{e.date}</strong>
              <span className="muted small">{WEEK[new Date(e.date + 'T00:00:00Z').getUTCDay()]}</span>
              <span className="muted small">{countWords(e.content)} 词</span>
              <span className="spacer" />
              <span className={`badge ${e.reviewed ? 'ok' : ''}`}>{e.reviewed ? '已批改' : '未批改'}</span>
            </div>
            <div className="snippet">{e.content.slice(0, 240)}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
