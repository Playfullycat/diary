import { all, get, nowIso } from '@/lib/db';
import StudyClient, { type Card } from './StudyClient';

/** 一次最多带出多少个从没复习过的新词，免得一下子太多 */
const NEW_LIMIT = 20;

export default function StudyPage() {
  const now = nowIso();
  const cols = 'id, term, phonetic, meaning, example, source_sentence, note, kind, interval_days, ease, reps';
  const due = all<Card>(`SELECT ${cols} FROM vocab WHERE due_at IS NOT NULL AND due_at <= ? ORDER BY due_at, id`, now);
  const fresh = all<Card>(`SELECT ${cols} FROM vocab WHERE due_at IS NULL ORDER BY id LIMIT ?`, NEW_LIMIT);
  const total = get<{ n: number }>('SELECT COUNT(*) AS n FROM vocab')?.n ?? 0;
  const freshTotal = get<{ n: number }>('SELECT COUNT(*) AS n FROM vocab WHERE due_at IS NULL')?.n ?? 0;
  const next = get<{ due_at: string }>('SELECT due_at FROM vocab WHERE due_at > ? ORDER BY due_at LIMIT 1', now)?.due_at ?? null;

  return (
    <StudyClient
      initial={[...due, ...fresh]}
      total={total}
      moreNew={Math.max(0, freshTotal - fresh.length)}
      nextDue={next}
    />
  );
}
