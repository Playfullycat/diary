import { all, type Vocab } from '@/lib/db';
import VocabClient from './VocabClient';

export default function VocabPage() {
  return <VocabClient kind="word" initial={all<Vocab>("SELECT * FROM vocab WHERE kind = 'word' ORDER BY id DESC")} />;
}
