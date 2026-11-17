import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { BACKUP_DIR, all, get, nowIso, run, transaction, type Entry, type ReviewRow } from './db';
import { SECRET_KEYS, allSettings, setSetting } from './settings';
import * as dav from './webdav';
import type { ReviewResult } from './shared';

const MAGIC = Buffer.from('DIARYENC');
const FILE_RE = /^diary-(\d{4})(\d{2})(\d{2})-(\d{6})(-prerestore)?\.zip(\.enc)?$/;

interface BackupData {
  app: 'english-diary';
  version: 1;
  exported_at: string;
  entries: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  vocab: Record<string, unknown>[];
  /** 下面三项是后来加的，早期的备份里没有 */
  translations?: Record<string, unknown>[];
  exercises?: Record<string, unknown>[];
  reports?: Record<string, unknown>[];
  reading?: Record<string, unknown>[];
  settings: Record<string, string>;
}

function collect(): BackupData {
  const settings: Record<string, string> = {};
  for (const r of all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
    if (!SECRET_KEYS.includes(r.key)) settings[r.key] = r.value;
  }
  return {
    app: 'english-diary',
    version: 1,
    exported_at: nowIso(),
    entries: all('SELECT * FROM entries ORDER BY id'),
    reviews: all('SELECT * FROM reviews ORDER BY id'),
    vocab: all('SELECT * FROM vocab ORDER BY id'),
    translations: all('SELECT * FROM translations ORDER BY id'),
    exercises: all('SELECT * FROM exercises ORDER BY id'),
    reports: all('SELECT * FROM reports ORDER BY week_start'),
    reading: all('SELECT * FROM reading ORDER BY book_id'),
    settings,
  };
}

function csvCell(v: unknown) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

/** 生成备份 ZIP：data.json（用于恢复）+ 每篇日记的 Markdown + 生词本 CSV（方便人读和导入 Anki） */
export function buildZip(): Buffer {
  const data = collect();
  const files: Record<string, Uint8Array> = {
    'data.json': strToU8(JSON.stringify(data, null, 2)),
    'README.txt': strToU8(
      '英语日记备份\n\ndata.json  完整数据，在网站"设置 → 备份"里上传本 ZIP 即可恢复\nentries/   每篇日记的 Markdown\nvocab.csv  生词本，可用 Excel 打开或导入 Anki\nphrases.csv  搭配本，格式同上\n\n备份不包含登录密码、API 密钥和 WebDAV 密码，恢复后这些保持当前设置。\n',
    ),
  };

  const latest = new Map<number, ReviewRow>();
  for (const r of data.reviews as unknown as ReviewRow[]) latest.set(r.entry_id, r);
  for (const e of data.entries as unknown as Entry[]) {
    let md = `# ${e.date}\n\n## 原文\n\n${e.content}\n`;
    const rv = latest.get(e.id);
    if (rv) {
      try {
        const res = JSON.parse(rv.result) as ReviewResult;
        md += `\n## 修改版\n\n${res.corrected_text}\n`;
        if (res.polished_text) md += `\n## 润色版\n\n${res.polished_text}\n`;
        if (res.issues?.length) {
          md += '\n## 修改说明\n\n';
          for (const i of res.issues) md += `- ${i.original} → ${i.corrected}：${i.explanation}\n`;
        }
      } catch {
        // 批改结果损坏时只导出原文
      }
    }
    files[`entries/${e.date}-${e.id}.md`] = strToU8(md);
  }

  for (const [kind, name] of [['word', 'vocab.csv'], ['phrase', 'phrases.csv']] as const) {
    const rows = [['term', 'phonetic', 'meaning', 'example', 'source_sentence'].join(',')];
    for (const v of data.vocab) {
      if ((v.kind ?? 'word') !== kind) continue;
      rows.push([v.term, v.phonetic, v.meaning, v.example, v.source_sentence].map(csvCell).join(','));
    }
    files[name] = strToU8('﻿' + rows.join('\r\n'));
  }

  return Buffer.from(zipSync(files, { level: 6 }));
}

function encrypt(buf: Buffer, password: string) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

function decrypt(buf: Buffer, password: string) {
  const salt = buf.subarray(8, 24);
  const iv = buf.subarray(24, 36);
  const tag = buf.subarray(36, 52);
  const key = crypto.scryptSync(password, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(buf.subarray(52)), decipher.final()]);
  } catch {
    throw new Error('备份密码不对，无法解密');
  }
}

/** 备份文件内容：设置了备份密码就加密 */
export function buildBackupFile() {
  const password = allSettings().backup_password;
  const zip = buildZip();
  return password ? { data: encrypt(zip, password), ext: '.zip.enc' } : { data: zip, ext: '.zip' };
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export const KEEP_DAYS_DEFAULT = 31;
export const KEEP_DAYS_MAX = 3650;

/** 设置里的保留天数；填得不对就用默认值 */
export function keepDays() {
  const n = Number(allSettings().backup_keep_days);
  return Number.isInteger(n) && n >= 1 && n <= KEEP_DAYS_MAX ? n : KEEP_DAYS_DEFAULT;
}

/**
 * 保留策略：最近 days 天内每天保留最新的一份，更早的删除；最新的一份无论多旧都保留
 * （免得停用一段时间后把备份删光）。恢复前的保险备份另外保留最近 3 份。
 * 只处理符合命名规则的文件，返回应删除的文件名。
 */
export function toDelete(names: string[], days: number, now = new Date()): string[] {
  const today = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  const parsed = names
    .map((n) => {
      const m = n.match(FILE_RE);
      if (!m) return null;
      const dayNum = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
      return { n, sort: m[1] + m[2] + m[3] + m[4], day: m[1] + m[2] + m[3], age: today - dayNum, pre: !!m[5] };
    })
    .filter((x) => x !== null)
    .sort((a, b) => (a.sort < b.sort ? 1 : -1));

  const keep = new Set<string>();
  parsed.filter((p) => p.pre).slice(0, 3).forEach((p) => keep.add(p.n));
  const regular = parsed.filter((p) => !p.pre);
  if (regular[0]) keep.add(regular[0].n);
  const seen = new Set<string>();
  for (const p of regular) {
    if (p.age >= days || seen.has(p.day)) continue;
    seen.add(p.day);
    keep.add(p.n);
  }
  return parsed.filter((p) => !keep.has(p.n)).map((p) => p.n);
}

export function davConfig(): dav.Dav | null {
  const s = allSettings();
  if (!s.webdav_url?.trim()) return null;
  return { url: s.webdav_url.trim(), user: s.webdav_user ?? '', pass: s.webdav_pass ?? '' };
}

export interface BackupLog {
  id: number;
  created_at: string;
  file: string;
  size: number;
  ok: number;
  remote: 'ok' | 'failed' | 'skipped';
  message: string;
}

let running = false;

/** 执行一次备份：先写本地，再上传 WebDAV 并校验，最后按保留策略清理 */
export async function runBackup(opts: { remote?: boolean; tag?: string } = {}): Promise<BackupLog> {
  if (running) throw new Error('已有备份正在进行');
  running = true;
  let file = '';
  let size = 0;
  let ok = 0;
  let remote: BackupLog['remote'] = 'skipped';
  const messages: string[] = [];
  try {
    const { data, ext } = buildBackupFile();
    file = `diary-${stamp()}${opts.tag ?? ''}${ext}`;
    size = data.length;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(path.join(BACKUP_DIR, file), data);
    ok = 1;
    const days = keepDays();
    for (const n of toDelete(fs.readdirSync(BACKUP_DIR), days)) fs.rmSync(path.join(BACKUP_DIR, n), { force: true });

    const cfg = opts.remote === false ? null : davConfig();
    if (cfg) {
      try {
        await dav.ensureDir(cfg);
        await dav.put(cfg, file, data);
        await dav.verify(cfg, file, size);
        remote = 'ok';
        try {
          for (const n of toDelete((await dav.list(cfg)).map((f) => f.name), days)) await dav.remove(cfg, n);
        } catch (e) {
          messages.push(`清理网盘旧备份时出错：${(e as Error).message}`);
        }
      } catch (e) {
        remote = 'failed';
        messages.push(`上传到网盘失败：${(e as Error).message}`);
      }
    }
  } catch (e) {
    messages.push(`本地备份失败：${(e as Error).message}`);
  } finally {
    running = false;
  }
  const info = run(
    'INSERT INTO backup_log(created_at, file, size, ok, remote, message) VALUES(?,?,?,?,?,?)',
    nowIso(),
    file,
    size,
    ok,
    remote,
    messages.join('；'),
  );
  run('DELETE FROM backup_log WHERE id NOT IN (SELECT id FROM backup_log ORDER BY id DESC LIMIT 60)');
  return get<BackupLog>('SELECT * FROM backup_log WHERE id = ?', Number(info.lastInsertRowid))!;
}

const COLS = {
  entries: ['id', 'date', 'content', 'created_at', 'updated_at'],
  reviews: ['id', 'entry_id', 'original_text', 'result', 'level_estimate', 'model', 'created_at'],
  vocab: [
    'id', 'term', 'term_key', 'phonetic', 'meaning', 'example', 'source_sentence', 'source_type',
    'entry_id', 'note', 'created_at', 'due_at', 'interval_days', 'ease', 'reps', 'kind',
  ],
  translations: ['id', 'entry_id', 'review_id', 'sentences', 'answers', 'feedback', 'model', 'created_at', 'updated_at'],
  exercises: ['id', 'focus', 'questions', 'answers', 'score', 'model', 'created_at', 'done_at'],
  reports: ['week_start', 'content', 'model', 'created_at'],
  reading: ['book_id', 'status', 'updated_at'],
} as const;

/** 从备份文件恢复：覆盖现有日记、批改和生词本。恢复前会自动在本地留一份当前数据 */
export async function restore(file: Buffer, password?: string) {
  let zip = file;
  if (file.subarray(0, 8).equals(MAGIC)) {
    const pw = password || allSettings().backup_password;
    if (!pw) throw new Error('这是加密备份，请填写备份密码');
    zip = decrypt(file, pw);
  }
  let data: BackupData;
  try {
    const unzipped = unzipSync(new Uint8Array(zip), { filter: (f) => f.name === 'data.json' });
    data = JSON.parse(strFromU8(unzipped['data.json']));
  } catch {
    throw new Error('无法读取备份文件：它可能已损坏，或不是本站生成的备份');
  }
  if (data?.app !== 'english-diary' || !Array.isArray(data.entries) || !Array.isArray(data.vocab)) {
    throw new Error('备份文件格式不对');
  }

  await runBackup({ remote: false, tag: '-prerestore' });

  transaction(() => {
    run('DELETE FROM translations');
    run('DELETE FROM exercises');
    run('DELETE FROM reports');
    run('DELETE FROM reading');
    run('DELETE FROM reviews');
    run('DELETE FROM entries');
    run('DELETE FROM vocab');
    for (const table of ['entries', 'reviews', 'vocab', 'translations', 'exercises', 'reports', 'reading'] as const) {
      const cols = COLS[table];
      const sql = `INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`;
      for (const row of (data[table] ?? []) as Record<string, unknown>[]) {
        const values = cols.map((c) => {
          const v = row[c];
          if (v === undefined || v === null) {
            if (c === 'ease') return 2.5;
            if (c === 'kind') return 'word';
            if (c === 'interval_days' || c === 'reps') return 0;
            if (['level_estimate', 'model', 'entry_id', 'due_at', 'score', 'done_at'].includes(c)) return null;
            if (c === 'answers' || c === 'feedback' || c === 'focus') return '[]';
            return '';
          }
          return v as string | number;
        });
        run(sql, ...values);
      }
    }
    for (const [k, v] of Object.entries(data.settings ?? {})) {
      if (!SECRET_KEYS.includes(k) && typeof v === 'string') setSetting(k, v);
    }
  });
  return { entries: data.entries.length, vocab: data.vocab.length };
}

export interface RemoteBackup {
  name: string;
  size: number;
  /** 备份时间，取自文件名，形如 2026-11-17 03:00:05 */
  time: string;
  encrypted: boolean;
}

/** 网盘里可以用来恢复的备份，最新的在前 */
export async function listRemote(): Promise<RemoteBackup[]> {
  const cfg = davConfig();
  if (!cfg) throw new Error('还没有配置 WebDAV 网盘');
  const out: (RemoteBackup & { sort: string })[] = [];
  for (const f of await dav.list(cfg)) {
    const m = f.name.match(FILE_RE);
    if (!m || m[5]) continue;
    const t = m[4];
    out.push({
      name: f.name,
      size: f.size,
      time: `${m[1]}-${m[2]}-${m[3]} ${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`,
      encrypted: !!m[6],
      sort: m[1] + m[2] + m[3] + t,
    });
  }
  return out.sort((a, b) => (a.sort < b.sort ? 1 : -1)).map(({ sort: _sort, ...rest }) => rest);
}

/** 从网盘下载一份备份并恢复；不指定文件名就用最新的一份 */
export async function restoreRemote(name?: string, password?: string) {
  const cfg = davConfig();
  if (!cfg) throw new Error('还没有配置 WebDAV 网盘');
  let target = name;
  if (target) {
    if (!FILE_RE.test(target)) throw new Error('备份文件名不对');
  } else {
    target = (await listRemote())[0]?.name;
    if (!target) throw new Error('网盘里还没有备份');
  }
  const file = await dav.download(cfg, target);
  return { name: target, ...(await restore(file, password)) };
}

export interface BackupHealth {
  remoteConfigured: boolean;
  lastOk: string | null;
  lastRemoteOk: string | null;
  warning: string | null;
}

export function backupHealth(): BackupHealth {
  const remoteConfigured = !!davConfig();
  const lastOk = get<{ created_at: string }>('SELECT created_at FROM backup_log WHERE ok = 1 ORDER BY id DESC LIMIT 1')?.created_at ?? null;
  const lastRemoteOk =
    get<{ created_at: string }>("SELECT created_at FROM backup_log WHERE remote = 'ok' ORDER BY id DESC LIMIT 1")?.created_at ?? null;
  const first = get<{ created_at: string }>('SELECT created_at FROM entries ORDER BY id LIMIT 1')?.created_at;
  const stale = (t: string | null) => {
    // 还没有日记，或第一篇日记写了不到 3 天，都不算过期
    if (!first) return false;
    const since = t ?? first;
    return Date.now() - new Date(since).getTime() > 3 * 86400000;
  };
  let warning: string | null = null;
  if (stale(lastOk)) warning = '已经超过 3 天没有成功备份了。';
  else if (remoteConfigured && stale(lastRemoteOk)) warning = '已经超过 3 天没有成功上传备份到网盘了。';
  else if (!remoteConfigured && first) warning = null;
  return { remoteConfigured, lastOk, lastRemoteOk, warning };
}

export function recentLogs(limit = 10) {
  return all<BackupLog>('SELECT * FROM backup_log ORDER BY id DESC LIMIT ?', limit);
}
