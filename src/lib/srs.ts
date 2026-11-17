// 间隔复习的排期算法（浏览器和服务端共用，不要引入服务端模块）

export type Grade = 'again' | 'hard' | 'good';

export const GRADES: Grade[] = ['again', 'hard', 'good'];

export const GRADE_LABEL: Record<Grade, string> = {
  again: '忘了',
  hard: '有点模糊',
  good: '记得',
};

export interface CardState {
  interval_days: number;
  ease: number;
  reps: number;
}

/** "忘了"之后隔多少分钟再出现 */
export const AGAIN_MINUTES = 10;

/**
 * 简化版 SM-2：
 * - 忘了：从头开始，10 分钟后再来，以后间隔涨得慢一些
 * - 有点模糊：间隔只涨一点
 * - 记得：第一次 1 天，第二次 3 天，之后按 ease 倍数增长
 */
export function nextState(card: CardState, grade: Grade): CardState {
  const ease = card.ease || 2.5;
  if (grade === 'again') return { interval_days: 0, ease: Math.max(1.3, ease - 0.2), reps: 0 };
  if (grade === 'hard') {
    return {
      interval_days: card.reps === 0 ? 1 : Math.max(card.interval_days + 1, Math.round(card.interval_days * 1.2)),
      ease: Math.max(1.3, ease - 0.15),
      reps: card.reps + 1,
    };
  }
  let interval = 1;
  if (card.reps === 1) interval = 3;
  else if (card.reps > 1) interval = Math.max(card.interval_days + 1, Math.round(card.interval_days * ease));
  return { interval_days: Math.min(interval, 365), ease, reps: card.reps + 1 };
}

/** 到期时间：按天的间隔落在那一天的零点，这样当天任何时候打开都能复习到 */
export function dueAt(state: CardState, now = new Date()): Date {
  if (state.interval_days <= 0) return new Date(now.getTime() + AGAIN_MINUTES * 60_000);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + state.interval_days);
  return d;
}

export function intervalText(state: CardState) {
  const d = state.interval_days;
  if (d <= 0) return `${AGAIN_MINUTES} 分钟后`;
  if (d === 1) return '明天';
  if (d < 30) return `${d} 天后`;
  if (d < 365) return `约 ${Math.round(d / 30)} 个月后`;
  return '1 年后';
}
