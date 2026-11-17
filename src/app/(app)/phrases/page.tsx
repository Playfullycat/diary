import { all, type Vocab } from '@/lib/db';
import VocabClient from '../vocab/VocabClient';

export default function PhrasesPage() {
  return <VocabClient kind="phrase" initial={all<Vocab>("SELECT * FROM vocab WHERE kind = 'phrase' ORDER BY id DESC")} />;
}
