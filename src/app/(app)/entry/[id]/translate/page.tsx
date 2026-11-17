import { notFound } from 'next/navigation';
import { isBusy } from '@/lib/busy';
import { get, type Entry } from '@/lib/db';
import { latestReview } from '@/lib/review-state';
import { getSetting } from '@/lib/settings';
import { getTranslation, transKey } from '@/lib/translation';
import TranslateClient from './TranslateClient';

export default async function TranslatePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const entry = Number.isInteger(id) ? get<Entry>('SELECT * FROM entries WHERE id = ?', id) : undefined;
  if (!entry) notFound();
  const review = latestReview(id);

  return (
    <TranslateClient
      entryId={id}
      date={entry.date}
      reviewed={!!review}
      translation={review ? getTranslation(review.id) : null}
      busy={isBusy(transKey(id))}
      aiReady={!!getSetting('ai_api_key')}
    />
  );
}
