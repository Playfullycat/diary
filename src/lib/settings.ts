import { all, get, run } from './db';

/** 这些键不会出现在备份文件里，也不会原样返回给浏览器 */
export const SECRET_KEYS = ['password_hash', 'session_secret', 'ai_api_key', 'webdav_pass', 'backup_password'];

export const DEFAULTS: Record<string, string> = {
  ai_preset: 'anthropic',
  ai_protocol: 'anthropic',
  ai_base_url: 'https://api.anthropic.com',
  ai_model: 'claude-opus-5-5',
  level: 'A2',
  level_mode: 'auto',
  backup_enabled: '1',
  backup_hour: '3',
  backup_keep_days: '31',
  webdav_url: '',
  webdav_user: '',
};

export function getSetting(key: string): string {
  const row = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? DEFAULTS[key] ?? '';
}

export function setSetting(key: string, value: string) {
  run(
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export function allSettings(): Record<string, string> {
  const out: Record<string, string> = { ...DEFAULTS };
  for (const r of all<{ key: string; value: string }>('SELECT key, value FROM settings')) out[r.key] = r.value;
  return out;
}

/** 给设置页用：密钥类只返回"是否已填" */
export function publicSettings() {
  const s = allSettings();
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(s)) {
    if (SECRET_KEYS.includes(k)) continue;
    out[k] = v;
  }
  out.has_ai_api_key = !!s.ai_api_key;
  out.has_webdav_pass = !!s.webdav_pass;
  out.has_backup_password = !!s.backup_password;
  return out;
}
