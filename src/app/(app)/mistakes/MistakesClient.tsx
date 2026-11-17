'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { EntryStat, Mistake } from '@/lib/mistakes';
import { ISSUE_TYPE_LABEL, SEVERITY_LABEL, type IssueType } from '@/lib/shared';

const RANGES = [
  { id: 'all', label: '全部', days: 0 },
  { id: '30', label: '最近 30 天', days: 30 },
  { id: '7', label: '最近 7 天', days: 7 },
] as const;

const EXAMPLES = 8;

function sinceDate(days: number) {
  if (!days) return '';
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 每 100 词里"必须改"的数量 */
function rate(list: EntryStat[]) {
  const words = list.reduce((s, e) => s + e.words, 0);
  if (!words) return null;
  return (list.reduce((s, e) => s + e.must, 0) / words) * 100;
}

export default function MistakesClient({ mistakes, entries }: { mistakes: Mistake[]; entries: EntryStat[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('all');
  const [type, setType] = useState<IssueType | 'all'>('all');
  const [mustOnly, setMustOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const since = sinceDate(RANGES.find((r) => r.id === range)!.days);
  const inRange = useMemo(
    () => mistakes.filter((m) => m.date >= since && (!mustOnly || m.severity === 'must')),
    [mistakes, since, mustOnly],
  );
  const entriesInRange = useMemo(() => entries.filter((e) => e.date >= since), [entries, since]);

  const byType = useMemo(() => {
    const map = new Map<IssueType, number>();
    for (const m of inRange) map.set(m.type, (map.get(m.type) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [inRange]);

  const groups = useMemo(() => {
    const map = new Map<string, Mistake[]>();
    for (const m of inRange) {
      if (type !== 'all' && m.type !== type) continue;
      const list = map.get(m.group);
      if (list) list.push(m);
      else map.set(m.group, [m]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [inRange, type]);

  const top = groups[0]?.[1].length ?? 1;
  // 进步情况：最近 5 篇和再之前 5 篇比（entries 按日期从新到旧）
  const recent = rate(entries.slice(0, 5));
  const before = entries.length >= 6 ? rate(entries.slice(5, 10)) : null;

  if (entries.length === 0) {
    return (
      <>
        <h1 style={{ marginBottom: 14 }}>错题本</h1>
        <div className="card muted">还没有批改过的日记。批改之后，这里会按类型统计你常犯的错误，方便集中看。</div>
      </>
    );
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>错题本</h1>
        <span className="muted small">{entriesInRange.length} 篇日记 · {inRange.length} 处修改</span>
        <span className="spacer" />
        <div className="tabs" role="tablist" aria-label="时间范围">
          {RANGES.map((r) => (
            <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'on' : ''} onClick={() => { setRange(r.id); setOpen(null); }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {recent !== null && (
        <div className="card">
          <strong>最近 5 篇：</strong>平均每 100 词有 {recent.toFixed(1)} 处必须改的错误
          {before !== null && (
            <span className="muted">
              ，再之前 5 篇是 {before.toFixed(1)} 处
              {recent < before - 0.05 ? '，在进步。' : recent > before + 0.05 ? '。写得更长、更敢用新表达时错误变多是正常的。' : '，基本持平。'}
            </span>
          )}
          {before === null && <span className="muted">。批改满 6 篇后会和之前的做对比。</span>}
        </div>
      )}

      <div className="row" style={{ marginBottom: 14 }}>
        <button className={`chip ${type === 'all' ? 'on' : ''}`} onClick={() => { setType('all'); setOpen(null); }}>全部类型 {inRange.length}</button>
        {byType.map(([t, n]) => (
          <button key={t} className={`chip ${type === t ? 'on' : ''}`} onClick={() => { setType(t); setOpen(null); }}>
            {ISSUE_TYPE_LABEL[t]} {n}
          </button>
        ))}
        <span className="spacer" />
        <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={mustOnly} onChange={(e) => setMustOnly(e.target.checked)} />
          只看必须改的
        </label>
      </div>

      {groups.length === 0 && <p className="muted">这个范围内没有记录。</p>}

      {groups.map(([name, list]) => {
        const isOpen = open === name;
        const entryCount = new Set(list.map((m) => m.entryId)).size;
        const visible = isOpen ? (more ? list : list.slice(0, EXAMPLES)) : [];
        return (
          <div className="mistake-group" key={name}>
            <button className="mistake-head" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : name); setMore(false); }}>
              <span className="name">{name}</span>
              <span className="bar"><i style={{ width: `${Math.max(4, (list.length / top) * 100)}%` }} /></span>
              <span className="count">{list.length} 次</span>
              <span className="muted small">{entryCount} 篇</span>
              <span className="muted" aria-hidden>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="mistake-body">
                {visible.map((m, i) => (
                  <div className={`issue ${m.severity}`} key={i}>
                    <div className="row">
                      <span className={`badge ${m.severity}`}>{SEVERITY_LABEL[m.severity]}</span>
                      <span className="badge">{ISSUE_TYPE_LABEL[m.type]}</span>
                      <span className="spacer" />
                      <Link href={`/entry/${m.entryId}`} className="small">{m.date} 的日记</Link>
                    </div>
                    <div className="change"><del>{m.original}</del> → <ins>{m.corrected}</ins></div>
                    <p>{m.explanation}</p>
                  </div>
                ))}
                {!more && list.length > EXAMPLES && (
                  <button onClick={() => setMore(true)}>显示全部 {list.length} 条</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
