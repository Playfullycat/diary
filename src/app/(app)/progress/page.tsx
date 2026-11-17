import { isBusy } from '@/lib/busy';
import { localDate } from '@/lib/db';
import { addDays, weekStart } from '@/lib/practice';
import { getSetting } from '@/lib/settings';
import { LEVELS } from '@/lib/shared';
import { getReport, loadProgress, reportKey, weekStats } from '@/lib/weekly';
import Charts from './Charts';
import WeekReportCard from './WeekReportCard';

const CHART_WEEKS = 12;
const CHART_ENTRIES = 30;

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const today = localDate();
  const thisWeek = weekStart(today);
  const asked = (await searchParams).week ?? '';
  const week = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= thisWeek ? weekStart(asked) : thisWeek;

  const data = loadProgress();
  const weeks = Array.from({ length: CHART_WEEKS }, (_, i) => {
    const s = weekStats(data, addDays(thisWeek, (i - CHART_WEEKS + 1) * 7));
    return { start: s.start, words: s.words, entries: s.entries };
  });
  // 图上按时间从早到晚
  const reviewed = [...data.reviewed].reverse().slice(-CHART_ENTRIES);
  const rates = reviewed.filter((e) => e.words > 0).map((e) => ({ date: e.date, words: e.words, must: e.must, rate: (e.must / e.words) * 100 }));
  const codes = LEVELS.map((l) => l.code) as string[];
  const levels = reviewed.filter((e) => e.level && codes.includes(e.level)).map((e) => ({ date: e.date, level: e.level as string }));

  return (
    <>
      <h1 style={{ marginBottom: 14 }}>进度</h1>
      <WeekReportCard
        key={week}
        stats={weekStats(data, week)}
        previous={weekStats(data, addDays(week, -7))}
        saved={getReport(week)}
        isThisWeek={week === thisWeek}
        busy={isBusy(reportKey(week))}
        aiReady={!!getSetting('ai_api_key')}
      />
      <Charts weeks={weeks} rates={rates} levels={levels} />
    </>
  );
}
