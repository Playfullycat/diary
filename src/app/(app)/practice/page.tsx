import { isBusy } from '@/lib/busy';
import { all } from '@/lib/db';
import { EXERCISE_KEY, recentExercises } from '@/lib/exercises';
import { groupMistakes, loadMistakes } from '@/lib/mistakes';
import { getSetting } from '@/lib/settings';
import PracticeClient from './PracticeClient';

export default function PracticePage() {
  const groups = groupMistakes(loadMistakes().mistakes.filter((m) => m.severity === 'must'))
    .slice(0, 8)
    .map((g) => ({ name: g.name, count: g.list.length }));

  // 最近批改过的日记，以及各自回译做到哪一步
  const entries = all<{ id: number; date: string; answers: string | null }>(
    `SELECT e.id, e.date,
            (SELECT t.answers FROM translations t WHERE t.review_id = (SELECT MAX(id) FROM reviews WHERE entry_id = e.id)) AS answers
     FROM entries e WHERE EXISTS(SELECT 1 FROM reviews r WHERE r.entry_id = e.id)
     ORDER BY e.date DESC, e.id DESC LIMIT 6`,
  ).map((e) => ({
    id: e.id,
    date: e.date,
    state: e.answers === null ? ('new' as const) : /[A-Za-z]/.test(e.answers) ? ('done' as const) : ('ready' as const),
  }));

  return (
    <PracticeClient
      groups={groups}
      exercises={recentExercises()}
      entries={entries}
      busy={isBusy(EXERCISE_KEY)}
      aiReady={!!getSetting('ai_api_key')}
    />
  );
}
