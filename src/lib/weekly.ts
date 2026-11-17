import { all, get, localDate } from './db';
import { groupMistakes, loadMistakes, type EntryStat, type Mistake } from './mistakes';
import { addDays, type WeekReport, type WeekStats } from './practice';
import { countWords } from './shared';

export const reportKey = (week: string) => `report:${week}`;

interface Loaded {
  written: { date: string; words: number }[];
  reviewed: EntryStat[];
  mistakes: Mistake[];
  vocab: { date: string; kind: string }[];
}

/** 一次把算周数据要用的东西都读出来，算多周时不用重复查 */
export function loadProgress(): Loaded {
  const { mistakes, entries } = loadMistakes();
  return {
    written: all<{ date: string; content: string }>("SELECT date, content FROM entries WHERE trim(content) != ''").map((e) => ({
      date: e.date,
      words: countWords(e.content),
    })),
    reviewed: entries,
    mistakes,
    // created_at 存的是 UTC 时间，换成服务器本地日期再归到周
    vocab: all<{ created_at: string; kind: string }>('SELECT created_at, kind FROM vocab').map((v) => ({
      date: localDate(new Date(v.created_at)),
      kind: v.kind,
    })),
  };
}

export function weekStats(data: Loaded, start: string): WeekStats {
  const end = addDays(start, 6);
  const within = <T extends { date: string }>(list: T[]) => list.filter((x) => x.date >= start && x.date <= end);
  const written = within(data.written);
  const reviewed = within(data.reviewed);
  const reviewedWords = reviewed.reduce((s, e) => s + e.words, 0);
  const must = reviewed.reduce((s, e) => s + e.must, 0);
  const vocab = within(data.vocab);
  return {
    start,
    end,
    entries: written.length,
    days: new Set(written.map((e) => e.date)).size,
    words: written.reduce((s, e) => s + e.words, 0),
    reviewed: reviewed.length,
    must,
    rate: reviewedWords ? (must / reviewedWords) * 100 : null,
    newWords: vocab.filter((v) => v.kind === 'word').length,
    newPhrases: vocab.filter((v) => v.kind === 'phrase').length,
    top: groupMistakes(within(data.mistakes).filter((m) => m.severity !== 'advanced'))
      .slice(0, 5)
      .map((g) => ({ name: g.name, count: g.list.length })),
  };
}

/** 给 AI 看的本周错误例子：优先必须改的，每类最多 3 个 */
export function weekExamples(data: Loaded, start: string, limit = 12) {
  const end = addDays(start, 6);
  const out: Mistake[] = [];
  for (const g of groupMistakes(data.mistakes.filter((m) => m.date >= start && m.date <= end && m.severity === 'must'))) {
    out.push(...g.list.slice(0, 3));
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

export function getReport(week: string): { report: WeekReport; created_at: string; model: string | null } | null {
  const row = get<{ content: string; created_at: string; model: string | null }>('SELECT content, created_at, model FROM reports WHERE week_start = ?', week);
  if (!row) return null;
  try {
    return { report: JSON.parse(row.content) as WeekReport, created_at: row.created_at, model: row.model };
  } catch {
    return null;
  }
}
