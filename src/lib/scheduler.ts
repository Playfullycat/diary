import { get, localDate } from './db';
import { getSetting } from './settings';
import { runBackup } from './backup';

const g = globalThis as unknown as { __diaryScheduler?: boolean };

async function tick() {
  try {
    if (getSetting('backup_enabled') === '0') return;
    const hour = Number(getSetting('backup_hour')) || 0;
    const now = new Date();
    if (now.getHours() < hour) return;
    if (!get('SELECT id FROM entries LIMIT 1')) return;

    const last = get<{ created_at: string; ok: number; remote: string }>(
      "SELECT created_at, ok, remote FROM backup_log WHERE file NOT LIKE '%prerestore%' ORDER BY id DESC LIMIT 1",
    );
    if (last) {
      const at = new Date(last.created_at);
      const good = last.ok === 1 && last.remote !== 'failed';
      if (good && localDate(at) === localDate(now)) return; // 今天已经成功备份过
      if (!good && now.getTime() - at.getTime() < 60 * 60 * 1000) return; // 失败后一小时内不重试
    }
    await runBackup();
  } catch (e) {
    console.error('[backup] scheduler error', e);
  }
}

export function startScheduler() {
  if (g.__diaryScheduler) return;
  g.__diaryScheduler = true;
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000);
}
