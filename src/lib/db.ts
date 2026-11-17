import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const g = globalThis as unknown as { __diaryDb?: DatabaseSync };

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  result TEXT NOT NULL,
  level_estimate TEXT,
  model TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_entry ON reviews(entry_id);

CREATE TABLE IF NOT EXISTS vocab (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL,
  term_key TEXT NOT NULL UNIQUE,
  phonetic TEXT NOT NULL DEFAULT '',
  meaning TEXT NOT NULL DEFAULT '',
  example TEXT NOT NULL DEFAULT '',
  source_sentence TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'manual',
  entry_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  due_at TEXT,
  interval_days INTEGER NOT NULL DEFAULT 0,
  ease REAL NOT NULL DEFAULT 2.5,
  reps INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  review_id INTEGER NOT NULL UNIQUE,
  sentences TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '[]',
  feedback TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  focus TEXT NOT NULL DEFAULT '[]',
  questions TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '[]',
  score INTEGER,
  model TEXT,
  created_at TEXT NOT NULL,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  week_start TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading (
  book_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  file TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL,
  remote TEXT NOT NULL DEFAULT 'skipped',
  message TEXT NOT NULL DEFAULT ''
);
`;

export function db(): DatabaseSync {
  if (g.__diaryDb) return g.__diaryDb;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // 通过 getBuiltinModule 取内置 SQLite，避免打包器处理 node:sqlite
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const d = new DatabaseSync(path.join(DATA_DIR, 'diary.db'));
  d.exec(SCHEMA);
  // 旧数据库升级：生词本和搭配本共用 vocab 表，用 kind 区分
  const cols = d.prepare('PRAGMA table_info(vocab)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'kind')) d.exec("ALTER TABLE vocab ADD COLUMN kind TEXT NOT NULL DEFAULT 'word'");
  g.__diaryDb = d;
  return d;
}

type P = SQLInputValue;

// node:sqlite 返回的行是无原型对象，展开成普通对象才能传给客户端组件
export function all<T>(sql: string, ...params: P[]): T[] {
  return db().prepare(sql).all(...params).map((r) => ({ ...r }) as T);
}

export function get<T>(sql: string, ...params: P[]): T | undefined {
  const r = db().prepare(sql).get(...params);
  return r ? ({ ...r } as T) : undefined;
}

export function run(sql: string, ...params: P[]) {
  return db().prepare(sql).run(...params);
}

export function transaction<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

/** 服务器本地时区的 YYYY-MM-DD */
export function localDate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface Entry {
  id: number;
  date: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewRow {
  id: number;
  entry_id: number;
  original_text: string;
  result: string;
  level_estimate: string | null;
  model: string | null;
  created_at: string;
}

export interface Vocab {
  id: number;
  term: string;
  term_key: string;
  phonetic: string;
  meaning: string;
  example: string;
  source_sentence: string;
  source_type: string;
  entry_id: number | null;
  note: string;
  created_at: string;
  kind: 'word' | 'phrase';
}
