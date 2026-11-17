import { loadMistakes } from '@/lib/mistakes';
import MistakesClient from './MistakesClient';

export default function MistakesPage() {
  return <MistakesClient {...loadMistakes()} />;
}
