import type { Issue } from './shared';

/**
 * 兜底：模型有时会在修改版里悄悄改掉一处，却不给对应的问题卡片。
 * 这里对比原文和修改版，把没有卡片覆盖的改动补成卡片。
 */

interface Tok {
  s: string;
  start: number;
  end: number;
}

const TOKEN = /[A-Za-z0-9']+|[一-鿿]+|[^\sA-Za-z0-9'一-鿿]/g;
const MAX_TOKENS = 2500;
const MAX_ADDED = 20;
const MAX_SPAN = 60;

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(TOKEN)) out.push({ s: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/** 按词做最长公共子序列，返回成对的改动区间（词下标，左闭右开） */
function hunks(a: Tok[], b: Tok[]) {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const lcs = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * w + j] = a[i].s === b[j].s ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);

  const out: { a0: number; a1: number; b0: number; b1: number }[] = [];
  let i = 0;
  let j = 0;
  let cur: { a0: number; a1: number; b0: number; b1: number } | null = null;
  while (i < n || j < m) {
    if (i < n && j < m && a[i].s === b[j].s) {
      if (cur) out.push(cur);
      cur = null;
      i++;
      j++;
      continue;
    }
    cur ??= { a0: i, a1: i, b0: j, b1: j };
    if (j >= m || (i < n && lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) cur.a1 = ++i;
    else cur.b1 = ++j;
  }
  if (cur) out.push(cur);
  return out;
}

function describe(original: string, corrected: string): Pick<Issue, 'type' | 'category' | 'explanation'> {
  if (original.toLowerCase() === corrected.toLowerCase())
    return {
      type: 'punctuation',
      category: '大小写',
      explanation: '这里只改了大小写。语言、国家、人名、星期、月份这类专有名词首字母要大写，句子开头和单独的 I 也要大写。',
    };
  if (!/[A-Za-z0-9一-鿿]/.test(original + corrected))
    return { type: 'punctuation', category: '标点', explanation: '修改版调整了这里的标点。' };
  if (/^[一-鿿s]+$/.test(original))
    return { type: 'chinese', category: '中文替代', explanation: `这个中文词在修改版里换成了 ${corrected}。` };
  return {
    type: 'grammar',
    category: '',
    explanation: '修改版改了这里，但 AI 没有单独解释。可以对照修改版看一下，想要解释的话重新批改一次。',
  };
}

export function fillMissingIssues(original: string, corrected: string, issues: Issue[]): Issue[] {
  const a = tokenize(original);
  const b = tokenize(corrected);
  if (!a.length || !b.length || a.length > MAX_TOKENS || b.length > MAX_TOKENS) return issues;

  // 已有卡片在原文里的位置（和页面高亮一样，按先后顺序找）
  const placed: { pos: number; issue: Issue }[] = [];
  const covered: { start: number; end: number }[] = [];
  let cursor = 0;
  let lastPos = 0;
  for (const issue of issues) {
    let at = original.indexOf(issue.original, cursor);
    if (at < 0) at = original.indexOf(issue.original);
    if (at >= 0) {
      covered.push({ start: at, end: at + issue.original.length });
      cursor = Math.max(cursor, at + issue.original.length);
      lastPos = at;
    }
    placed.push({ pos: lastPos, issue });
  }

  const added: { pos: number; issue: Issue }[] = [];
  for (const h of hunks(a, b)) {
    let { a0, a1, b0, b1 } = h;
    // 实际改动的部分（不含下面为了定位补上的前一个词），用来判断是哪类改动
    const rawFrom = a.slice(a0, a1).map((t) => t.s).join(' ');
    const rawTo = b.slice(b0, b1).map((t) => t.s).join(' ');
    // 纯插入或纯删除：带上前一个词，才有东西可以高亮、可以对照
    if (a0 === a1 || b0 === b1) {
      if (a0 === 0 || b0 === 0) continue;
      a0--;
      b0--;
    }
    const start = a[a0].start;
    const end = a[a1 - 1].end;
    if (end - start > MAX_SPAN) continue;
    if (covered.some((c) => start < c.end && end > c.start)) continue;
    const from = original.slice(start, end);
    const to = corrected.slice(b[b0].start, b[b1 - 1].end);
    if (from === to) continue;
    added.push({ pos: start, issue: { original: from, corrected: to, severity: 'must', ...describe(rawFrom, rawTo) } });
  }

  // 没覆盖的改动太多，说明模型没按"最小修改"来，补卡片只会更乱
  if (!added.length || added.length > MAX_ADDED) return issues;
  return [...placed, ...added].sort((x, y) => x.pos - y.pos).map((x) => x.issue);
}
