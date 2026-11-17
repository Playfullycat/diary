import { all } from './db';
import { getSetting } from './settings';
import { LEVELS, type LevelInfo } from './shared';

const CODES = LEVELS.map((l) => l.code) as string[];

export function normalizeLevel(v: unknown): string | null {
  const s = String(v ?? '').toUpperCase().trim();
  if (CODES.includes(s)) return s;
  if (s === 'C2') return 'C1';
  return null;
}

/** 取最近 5 篇批改的水平估计的中位数；不足 3 篇时不下结论 */
export function levelInfo(): LevelInfo {
  const chosen = normalizeLevel(getSetting('level')) ?? 'A2';
  const mode = getSetting('level_mode') === 'manual' ? 'manual' : 'auto';
  const rows = all<{ level_estimate: string }>(
    `SELECT level_estimate FROM reviews WHERE level_estimate IS NOT NULL AND level_estimate != ''
     ORDER BY id DESC LIMIT 5`,
  );
  const idx = rows.map((r) => CODES.indexOf(r.level_estimate)).filter((i) => i >= 0).sort((a, b) => a - b);
  const detected = idx.length >= 3 ? CODES[idx[Math.floor((idx.length - 1) / 2)]] : null;
  return {
    effective: mode === 'auto' && detected ? detected : chosen,
    chosen,
    mode,
    detected,
    samples: idx.length,
  };
}
