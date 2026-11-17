import { get, type ReviewRow } from './db';
import type { ReviewResult, ReviewView } from './shared';

/**
 * 记录哪些日记正在批改。批改要几十秒，期间用户可能切到别的页面再回来，
 * 页面要靠这里知道"还在批改"，而不是把按钮恢复成可点状态。
 */

const g = globalThis as unknown as {
  __reviewRunning?: Map<number, number>;
  __reviewFailed?: Map<number, string>;
};
const running = (g.__reviewRunning ??= new Map());
const failed = (g.__reviewFailed ??= new Map());

// 正常情况下批改结束就会清掉；这个上限只防意外残留
const STALE_MS = 15 * 60_000;

export function isReviewing(entryId: number) {
  const since = running.get(entryId);
  if (since === undefined) return false;
  if (Date.now() - since > STALE_MS) {
    running.delete(entryId);
    return false;
  }
  return true;
}

export function beginReview(entryId: number) {
  running.set(entryId, Date.now());
  failed.delete(entryId);
}

export function endReview(entryId: number, error?: string) {
  running.delete(entryId);
  if (error) failed.set(entryId, error);
}

/** 取出上次批改失败的原因，取一次就清掉 */
export function takeReviewError(entryId: number) {
  const message = failed.get(entryId) ?? null;
  failed.delete(entryId);
  return message;
}

export function latestReview(entryId: number): ReviewView | null {
  const row = get<ReviewRow>('SELECT * FROM reviews WHERE entry_id = ? ORDER BY id DESC LIMIT 1', entryId);
  if (!row) return null;
  try {
    return {
      id: row.id,
      original_text: row.original_text,
      created_at: row.created_at,
      model: row.model,
      result: JSON.parse(row.result) as ReviewResult,
    };
  } catch {
    return null;
  }
}
