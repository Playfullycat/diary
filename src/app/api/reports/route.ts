import { NextResponse } from 'next/server';
import { aiTask } from '@/lib/ai-route';
import { guard } from '@/lib/auth';
import { nowIso, run } from '@/lib/db';
import { levelInfo } from '@/lib/level';
import { addDays, weekStart } from '@/lib/practice';
import { makeWeekReport } from '@/lib/tutor';
import { getReport, loadProgress, reportKey, weekExamples, weekStats } from '@/lib/weekly';

/** 生成（或重新生成）某一周的 AI 小结 */
export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.week ?? '')) return NextResponse.json({ error: '周的格式不对' }, { status: 400 });
  const week = weekStart(String(body.week));
  const data = loadProgress();
  const stats = weekStats(data, week);
  if (!stats.entries) return NextResponse.json({ error: '这一周没有日记，没什么可总结的。' }, { status: 400 });

  return aiTask(reportKey(week), async () => {
    const { value, model } = await makeWeekReport(stats, weekStats(data, addDays(week, -7)), weekExamples(data, week), levelInfo().effective);
    run(
      `INSERT INTO reports(week_start, content, model, created_at) VALUES(?,?,?,?)
       ON CONFLICT(week_start) DO UPDATE SET content = excluded.content, model = excluded.model, created_at = excluded.created_at`,
      week, JSON.stringify(value), model, nowIso(),
    );
    return { report: getReport(week) };
  });
}
