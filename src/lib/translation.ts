import { get } from './db';
import type { TransFeedback, TransSentence, TranslationView } from './practice';

export const transKey = (entryId: number) => `translation:${entryId}`;

function parse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** 某次批改对应的回译练习（一次批改只生成一份中文） */
export function getTranslation(reviewId: number): TranslationView | null {
  const row = get<{ id: number; sentences: string; answers: string; feedback: string }>(
    'SELECT id, sentences, answers, feedback FROM translations WHERE review_id = ?',
    reviewId,
  );
  if (!row) return null;
  const sentences = parse<TransSentence[]>(row.sentences, []);
  if (!sentences.length) return null;
  const answers = parse<string[]>(row.answers, []);
  const feedback = parse<(TransFeedback | null)[]>(row.feedback, []);
  return {
    id: row.id,
    sentences,
    answers: sentences.map((_, i) => (typeof answers[i] === 'string' ? answers[i] : '')),
    feedback: feedback.length === sentences.length ? feedback : [],
  };
}
