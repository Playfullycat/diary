import { notFound } from 'next/navigation';
import { all, get, type Entry } from '@/lib/db';
import { levelInfo } from '@/lib/level';
import { isReviewing, latestReview } from '@/lib/review-state';
import { getSetting } from '@/lib/settings';
import { topicFor } from '@/lib/topics';
import EntryEditor from './EntryEditor';

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const entry = Number.isInteger(id) ? get<Entry>('SELECT * FROM entries WHERE id = ?', id) : undefined;
  if (!entry) notFound();

  return (
    <EntryEditor
      entry={entry}
      initialReview={latestReview(id)}
      initialReviewing={isReviewing(id)}
      initialLevel={levelInfo()}
      vocabKeys={all<{ term_key: string }>('SELECT term_key FROM vocab').map((v) => v.term_key)}
      aiReady={!!getSetting('ai_api_key')}
      topic={topicFor(entry.date)}
    />
  );
}
