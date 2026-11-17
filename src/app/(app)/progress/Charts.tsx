'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LEVELS } from '@/lib/shared';

interface Props {
  weeks: { start: string; words: number; entries: number }[];
  rates: { date: string; words: number; must: number; rate: number }[];
  levels: { date: string; level: string }[];
}

const H = 200;
const PAD = { top: 12, right: 12, bottom: 26, left: 40 };
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** 取一个好看的刻度上限和 3 到 4 条刻度线 */
function niceTicks(max: number) {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = 0; v < max + step - 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

interface Point {
  /** 横轴上的标签 */
  label: string;
  value: number;
  tip: ReactNode;
}

interface ChartProps {
  kind: 'bar' | 'line';
  points: Point[];
  /** 自定义纵轴刻度（用于水平这种分级数据） */
  yTicks?: { value: number; label: string }[];
  format?: (v: number) => string;
}

function Chart({ kind, points, yTicks, format = String }: ChartProps) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const ticks = yTicks ?? niceTicks(Math.max(...points.map((p) => p.value), 0)).map((v) => ({ value: v, label: format(v) }));
  const yMin = yTicks ? ticks[0].value - 0.5 : 0;
  const yMax = yTicks ? ticks[ticks.length - 1].value + 0.5 : ticks[ticks.length - 1].value;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const band = n ? innerW / n : 0;
  const x = (i: number) => PAD.left + band * (i + 0.5);
  const y = (v: number) => PAD.top + innerH * (1 - (v - yMin) / (yMax - yMin || 1));
  const barW = Math.min(28, band * 0.6);
  // 横轴标签太密时隔几个标一个，最后一个总是标
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 48))));
  const showLabel = (i: number) => (n - 1 - i) % every === 0;

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    if (!n || !band) return;
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX === undefined) return;
    setHover(Math.min(n - 1, Math.max(0, Math.floor((clientX - rect.left - PAD.left) / band))));
  }

  const tipLeft = hover === null ? 0 : Math.min(Math.max(x(hover), 80), Math.max(80, width - 80));

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={H} role="img" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={onMove} onTouchMove={onMove}>
          {ticks.map((t) => (
            <g key={t.value}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t.value)} y2={y(t.value)} className={t.value === 0 && !yTicks ? 'axis' : 'grid'} />
              <text x={PAD.left - 8} y={y(t.value)} dy="0.32em" textAnchor="end" className="tick">{t.label}</text>
            </g>
          ))}
          {points.map((p, i) => showLabel(i) && (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="tick">{p.label}</text>
          ))}

          {kind === 'bar' && points.map((p, i) => {
            if (p.value <= 0) return null;
            const top = y(p.value);
            const h = y(0) - top;
            const r = Math.min(4, h, barW / 2);
            // 只把顶端做圆角，底边贴着基线
            const d = `M${x(i) - barW / 2},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`;
            return <path key={i} d={d} className={`bar ${hover !== null && hover !== i ? 'dim' : ''}`} />;
          })}

          {kind === 'line' && n > 0 && (
            <>
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="cross" />}
              <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} className="line" />
              {points.map((p, i) => (
                <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5.5 : n > 20 ? 3 : 4} className="dot" />
              ))}
            </>
          )}
        </svg>
      )}
      {hover !== null && points[hover] && (
        <div className="chart-tip" style={{ left: tipLeft }}>{points[hover].tip}</div>
      )}
    </div>
  );
}

function Panel({ title, note, empty, children, table }: { title: string; note: string; empty: string | null; children: ReactNode; table: ReactNode }) {
  return (
    <div className="card">
      <h2 style={{ marginBottom: 2 }}>{title}</h2>
      <p className="muted small">{note}</p>
      {empty ? (
        <p className="muted" style={{ marginBottom: 0 }}>{empty}</p>
      ) : (
        <>
          {children}
          <details className="chart-table">
            <summary>查看数据</summary>
            {table}
          </details>
        </>
      )}
    </div>
  );
}

export default function Charts({ weeks, rates, levels }: Props) {
  const levelIndex = (code: string) => LEVELS.findIndex((l) => l.code === code);
  const levelName = (code: string) => LEVELS.find((l) => l.code === code)?.label ?? code;

  return (
    <>
      <Panel
        title="每周写作量"
        note="最近 12 周，每周写了多少词"
        empty={weeks.some((w) => w.words > 0) ? null : '还没有日记。'}
        table={
          <table className="logs">
            <thead><tr><th>周（周一）</th><th>词数</th><th>篇数</th></tr></thead>
            <tbody>{weeks.map((w) => <tr key={w.start}><td>{w.start}</td><td>{w.words}</td><td>{w.entries}</td></tr>)}</tbody>
          </table>
        }
      >
        <Chart
          kind="bar"
          points={weeks.map((w) => ({
            label: md(w.start),
            value: w.words,
            tip: <><b>{w.words} 词</b>{md(w.start)} 这周 · {w.entries} 篇</>,
          }))}
        />
      </Panel>

      <Panel
        title="错误率"
        note={`每篇日记里，每 100 词有几处必须改的错误（越低越好），最近 ${rates.length} 篇`}
        empty={rates.length >= 2 ? null : '批改满 2 篇后显示。'}
        table={
          <table className="logs">
            <thead><tr><th>日期</th><th>每 100 词</th><th>必须改</th><th>词数</th></tr></thead>
            <tbody>{rates.map((r, i) => <tr key={i}><td>{r.date}</td><td>{r.rate.toFixed(1)}</td><td>{r.must}</td><td>{r.words}</td></tr>)}</tbody>
          </table>
        }
      >
        <Chart
          kind="line"
          format={(v) => String(Number(v.toFixed(1)))}
          points={rates.map((r) => ({
            label: md(r.date),
            value: r.rate,
            tip: <><b>每 100 词 {r.rate.toFixed(1)} 处</b>{r.date} · {r.must} 处 / {r.words} 词</>,
          }))}
        />
      </Panel>

      <Panel
        title="水平估计"
        note="AI 每次批改时对这篇日记水平的判断。单篇会有波动，看整体走向"
        empty={levels.length >= 2 ? null : '批改满 2 篇后显示。'}
        table={
          <table className="logs">
            <thead><tr><th>日期</th><th>水平</th></tr></thead>
            <tbody>{levels.map((l, i) => <tr key={i}><td>{l.date}</td><td>{l.level} {levelName(l.level)}</td></tr>)}</tbody>
          </table>
        }
      >
        <Chart
          kind="line"
          yTicks={LEVELS.map((l, i) => ({ value: i, label: l.code }))}
          points={levels.map((l) => ({
            label: md(l.date),
            value: levelIndex(l.level),
            tip: <><b>{l.level} {levelName(l.level)}</b>{l.date}</>,
          }))}
        />
      </Panel>
    </>
  );
}
