// 练习相关的类型和纯函数（浏览器和服务端共用，不要引入服务端模块）

/** 回译练习里的一句：中文提示和参考英文 */
export interface TransSentence {
  zh: string;
  en: string;
}

export type Verdict = 'good' | 'minor' | 'wrong';

export interface TransFeedback {
  verdict: Verdict;
  comment: string;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  good: '没问题',
  minor: '有小问题',
  wrong: '需要改',
};

export interface TranslationView {
  id: number;
  sentences: TransSentence[];
  answers: string[];
  /** 和 sentences 一一对应；没答的句子是 null */
  feedback: (TransFeedback | null)[];
}

export interface Question {
  kind: 'choice' | 'fill';
  category: string;
  /** 题干，空的位置用 ___ 表示 */
  prompt: string;
  /** 选择题的选项 */
  options: string[];
  answer: string;
  /** 填空题里其他也算对的写法 */
  accept: string[];
  explanation: string;
}

export interface ExerciseView {
  id: number;
  focus: string[];
  questions: Question[];
  answers: string[];
  score: number | null;
  created_at: string;
  done_at: string | null;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCorrect(q: Question, answer: string | undefined) {
  if (!answer?.trim()) return false;
  const a = norm(answer);
  return a === norm(q.answer) || q.accept.some((x) => norm(x) === a);
}

export function scoreOf(questions: Question[], answers: string[]) {
  return questions.filter((q, i) => isCorrect(q, answers[i])).length;
}

/** 把英文段落拆成句子 */
export function splitSentences(text: string) {
  return text
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z]/.test(s));
}

export interface DiffToken {
  text: string;
  /** 另一边没有这个词 */
  changed: boolean;
}

/** 按词对比两句话（不分大小写、不管标点），标出各自多出来的词 */
export function diffWords(mine: string, ref: string): { mine: DiffToken[]; ref: DiffToken[] } {
  const a = mine.split(/\s+/).filter(Boolean);
  const b = ref.split(/\s+/).filter(Boolean);
  const key = (w: string) => w.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
  const ka = a.map(key);
  const kb = b.map(key);
  const w = b.length + 1;
  const lcs = new Uint16Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i * w + j] = ka[i] === kb[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
  const outA: DiffToken[] = [];
  const outB: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ka[i] === kb[j]) {
      outA.push({ text: a[i++], changed: false });
      outB.push({ text: b[j++], changed: false });
    } else if (j >= b.length || (i < a.length && lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) {
      outA.push({ text: a[i++], changed: true });
    } else {
      outB.push({ text: b[j++], changed: true });
    }
  }
  return { mine: outA, ref: outB };
}

// ---- 周 ----

export function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 所在那一周的周一 */
export function weekStart(date: string) {
  const weekday = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

export interface WeekStats {
  start: string;
  end: string;
  entries: number;
  days: number;
  words: number;
  reviewed: number;
  must: number;
  /** 每 100 词里必须改的数量；没有批改过的日记时为 null */
  rate: number | null;
  newWords: number;
  newPhrases: number;
  top: { name: string; count: number }[];
}

export interface WeekReport {
  summary: string;
  strengths: string[];
  focus: string[];
  suggestion: string;
}
