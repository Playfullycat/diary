import Link from 'next/link';

export interface DayStat {
  date: string;
  words: number;
  entryId: number;
}

const WEEKS = 18;
const DAY_LABEL = ['一', '', '三', '', '五', '', '日'];

function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 当前连续天数（今天还没写不算断）和历史最长连续天数 */
export function streaks(dates: string[], today: string) {
  const set = new Set(dates);
  let current = 0;
  let d = set.has(today) ? today : addDays(today, -1);
  while (set.has(d)) {
    current += 1;
    d = addDays(d, -1);
  }
  let longest = 0;
  for (const day of set) {
    if (set.has(addDays(day, -1))) continue;
    let n = 1;
    while (set.has(addDays(day, n))) n += 1;
    longest = Math.max(longest, n);
  }
  return { current, longest };
}

function level(words: number) {
  if (words <= 0) return 0;
  if (words < 40) return 1;
  if (words < 100) return 2;
  return 3;
}

/** 最近 18 周的写作日历：一列是一周，从周一到周日 */
export default function StreakCalendar({ days, today }: { days: DayStat[]; today: string }) {
  const map = new Map(days.map((d) => [d.date, d]));
  const weekday = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7; // 周一 = 0
  const start = addDays(today, -weekday - (WEEKS - 1) * 7);
  const month = today.slice(0, 7);
  const thisMonth = days.filter((d) => d.date.startsWith(month)).length;

  const weeks: { date: string; future: boolean }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, w * 7 + i);
      col.push({ date, future: date > today });
    }
    weeks.push(col);
  }

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>写作日历</h2>
        <span className="muted small">这个月写了 {thisMonth} 天</span>
        <span className="spacer" />
        <div className="legend">
          <span>少</span>
          {[0, 1, 2, 3].map((l) => <i key={l} className={`cal-cell l${l}`} style={{ margin: 0 }} />)}
          <span>多</span>
        </div>
      </div>
      <div className="cal-scroll">
        <div className="cal">
          <div className="cal-col cal-labels">
            <span className="cal-month" />
            {DAY_LABEL.map((l, i) => <span key={i}>{l}</span>)}
          </div>
          {weeks.map((col, w) => {
            const first = col[0].date;
            // 月份标在每个月的第一列；最左边那列只在紧接着不换月时才标，免得两个标签挤在一起
            const monthOf = (i: number) => weeks[i]?.[0].date.slice(5, 7);
            const showMonth = w === 0 ? monthOf(1) === monthOf(0) : monthOf(w) !== monthOf(w - 1);
            return (
              <div className="cal-col" key={first}>
                <span className="cal-month">{showMonth ? `${Number(first.slice(5, 7))}月` : ''}</span>
                {col.map((c) => {
                  const stat = map.get(c.date);
                  const cls = `cal-cell l${level(stat?.words ?? 0)}${c.date === today ? ' today' : ''}${c.future ? ' future' : ''}`;
                  const title = stat ? `${c.date} · ${stat.words} 词` : c.future ? c.date : `${c.date} · 没写`;
                  return stat ? (
                    <Link key={c.date} href={`/entry/${stat.entryId}`} className={cls} title={title} aria-label={title} />
                  ) : (
                    <i key={c.date} className={cls} title={title} />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
