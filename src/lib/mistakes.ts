import { all } from './db';
import { normalizeCategory } from './categories';
import { countWords, type IssueType, type ReviewResult, type Severity } from './shared';

export interface Mistake {
  entryId: number;
  date: string;
  type: IssueType;
  /** 归并后的细分类（时态、冠词…），模型没给时用大类名 */
  group: string;
  severity: Severity;
  original: string;
  corrected: string;
  explanation: string;
}

export interface EntryStat {
  entryId: number;
  date: string;
  words: number;
  must: number;
  level: string | null;
}

/** 汇总所有批改里的问题。每篇日记只算最新的一次批改，按日期从新到旧 */
export function loadMistakes(): { mistakes: Mistake[]; entries: EntryStat[] } {
  const rows = all<{ entry_id: number; date: string; original_text: string; result: string; level_estimate: string | null }>(
    `SELECT r.entry_id, e.date, r.original_text, r.result, r.level_estimate
     FROM reviews r JOIN entries e ON e.id = r.entry_id
     WHERE r.id = (SELECT MAX(id) FROM reviews WHERE entry_id = r.entry_id)
     ORDER BY e.date DESC, e.id DESC`,
  );

  const mistakes: Mistake[] = [];
  const entries: EntryStat[] = [];
  for (const row of rows) {
    let result: ReviewResult;
    try {
      result = JSON.parse(row.result) as ReviewResult;
    } catch {
      continue;
    }
    const issues = Array.isArray(result.issues) ? result.issues : [];
    entries.push({
      entryId: row.entry_id,
      date: row.date,
      words: countWords(row.original_text),
      must: issues.filter((i) => i.severity === 'must').length,
      level: row.level_estimate,
    });
    for (const i of issues) {
      mistakes.push({
        entryId: row.entry_id,
        date: row.date,
        type: i.type,
        group: normalizeCategory(i.type, i.category),
        severity: i.severity,
        original: i.original,
        corrected: i.corrected,
        explanation: i.explanation,
      });
    }
  }
  return { mistakes, entries };
}

/** 按细分类分组，出现次数多的在前 */
export function groupMistakes(mistakes: Mistake[]) {
  const map = new Map<string, Mistake[]>();
  for (const m of mistakes) {
    const list = map.get(m.group);
    if (list) list.push(m);
    else map.set(m.group, [m]);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length).map(([name, list]) => ({ name, list }));
}
