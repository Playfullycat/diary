import type { ReadingStatus } from '@/lib/books';
import { all } from '@/lib/db';
import { levelInfo } from '@/lib/level';
import ReadingClient from './ReadingClient';

export default function ReadingPage() {
  const marks: Record<string, ReadingStatus> = {};
  for (const r of all<{ book_id: string; status: ReadingStatus }>('SELECT book_id, status FROM reading')) marks[r.book_id] = r.status;
  return <ReadingClient level={levelInfo()} initialMarks={marks} />;
}
