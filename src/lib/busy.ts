/**
 * 记录哪些 AI 任务正在进行（回译、出题、周报）。这些任务要几十秒，
 * 页面靠这里知道"还在生成"，切走再回来也不会重复提交。
 */

const g = globalThis as unknown as { __busyTasks?: Map<string, number> };
const tasks = (g.__busyTasks ??= new Map());

// 正常情况下任务结束就会清掉；这个上限只防意外残留
const STALE_MS = 15 * 60_000;

export function isBusy(key: string) {
  const since = tasks.get(key);
  if (since === undefined) return false;
  if (Date.now() - since > STALE_MS) {
    tasks.delete(key);
    return false;
  }
  return true;
}

/** 同一个任务同时只跑一个；已经在跑就返回 null */
export async function runExclusive<T>(key: string, fn: () => Promise<T>): Promise<{ value: T } | null> {
  if (isBusy(key)) return null;
  tasks.set(key, Date.now());
  try {
    return { value: await fn() };
  } finally {
    tasks.delete(key);
  }
}
