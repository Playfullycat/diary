import { all, get } from './db';
import type { ExerciseView, Question } from './practice';

export const EXERCISE_KEY = 'exercise';

interface Row {
  id: number;
  focus: string;
  questions: string;
  answers: string;
  score: number | null;
  created_at: string;
  done_at: string | null;
}

function view(row: Row): ExerciseView | null {
  try {
    const questions = JSON.parse(row.questions) as Question[];
    if (!Array.isArray(questions) || !questions.length) return null;
    return {
      id: row.id,
      focus: JSON.parse(row.focus) as string[],
      questions,
      answers: JSON.parse(row.answers) as string[],
      score: row.score,
      created_at: row.created_at,
      done_at: row.done_at,
    };
  } catch {
    return null;
  }
}

export function getExercise(id: number) {
  const row = get<Row>('SELECT * FROM exercises WHERE id = ?', id);
  return row ? view(row) : null;
}

/** 最近的几组练习，新的在前 */
export function recentExercises(limit = 10) {
  return all<Row>('SELECT * FROM exercises ORDER BY id DESC LIMIT ?', limit)
    .map(view)
    .filter((x): x is ExerciseView => x !== null);
}
