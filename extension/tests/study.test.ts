import { beforeEach, describe, expect, it } from 'vitest';
import { buildPrompt } from '../src/ai/prompts';
import { addStudySet, createNotebook, dueCards, getNotebook, gradeCard, parseStudySet, progress, review, saveAttempt, scoreQuiz, validateNotebook, weakQuestions, type Card } from '../src/study/notebook';
import { freshDb } from './helpers';

const DAY = 86_400_000;
const card = (p: Partial<Card> = {}): Card => ({ id: 'c', q: 'Q', a: 'A', due: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, ...p });

describe('parsing generated study sets', () => {
  it('accepts valid JSON, even in a code fence, and normalises answers', () => {
    const reply = '```json\n{"flashcards":[{"q":"What is entropy?","a":"A measure of impurity"},{"q":"","a":"x"}],"quiz":[{"q":"Gain uses?","options":["Entropy","Colour","Size","Age"],"answer":"A","explain":"It is defined by it."},{"q":"bad","options":["a","a"],"answer":0},{"q":"out of range","options":["a","b"],"answer":5}]}\n```';
    const s = parseStudySet(reply)!;
    expect(s.flashcards).toEqual([{ q: 'What is entropy?', a: 'A measure of impurity' }]);
    expect(s.quiz).toEqual([{ q: 'Gain uses?', options: ['Entropy', 'Colour', 'Size', 'Age'], answer: 0, explain: 'It is defined by it.' }]);
  });
  it('rejects replies without usable cards or questions', () => {
    expect(parseStudySet('Sure! Here are some flashcards.')).toBeNull();
    expect(parseStudySet('{"flashcards": "nope"}')).toBeNull();
    expect(parseStudySet('{not json}')).toBeNull();
  });
  it('asks for JSON with the content as untrusted data', () => {
    const req = buildPrompt('study-set', { text: 'Information gain', category: 'Slide', description: '' }, 'study');
    expect(req.json).toBe(true);
    expect(req.messages[0]!.text).toMatch(/<content>\nInformation gain\n<\/content>[\s\S]*"flashcards"/);
  });
});

describe('review schedule', () => {
  it('again → 10 minutes, good → 1, 3, then × ease days, easy → longer', () => {
    const now = 1_000_000;
    const again = review(card({ reps: 3, interval: 10 }), 'again', now);
    expect(again).toMatchObject({ reps: 0, interval: 0, lapses: 1, due: now + 600_000 });
    expect(again.ease).toBeCloseTo(2.3);
    const g1 = review(card(), 'good', now);
    expect(g1).toMatchObject({ reps: 1, interval: 1, due: now + DAY });
    const g2 = review(g1, 'good', now);
    expect(g2.interval).toBe(3);
    expect(review(g2, 'good', now).interval).toBe(8);
    const e = review(card(), 'easy', now);
    expect(e.interval).toBe(4);
    expect(e.ease).toBeCloseTo(2.65);
    expect(review(card({ ease: 1.3 }), 'again', now).ease).toBe(1.3);
  });
  it('lists due cards and progress', () => {
    const nb = validateNotebook({ id: 'n', name: 'N', cards: [card({ id: 'a', due: 0 }), card({ id: 'b', due: 5e15, interval: 30, reps: 4 }), card({ id: 'c', due: 0, interval: 2, reps: 1 })], quiz: [], attempts: [{ at: 1, score: 2, total: 4, wrong: [] }, { at: 2, score: 3, total: 4, wrong: [] }] })!;
    expect(dueCards(nb, 1000).map((c) => c.id)).toEqual(['a', 'c']);
    expect(progress(nb, 1000)).toEqual({ cards: 3, due: 2, learning: 1, mastered: 1, quizzes: 2, best: 75, last: 75 });
  });
});

describe('quizzes', () => {
  const quiz = [
    { id: 'q1', q: 'One', options: ['a', 'b'], answer: 0 },
    { id: 'q2', q: 'Two', options: ['a', 'b'], answer: 1 },
  ];
  it('scores an attempt and finds weak questions', () => {
    const a = scoreQuiz(quiz, [0, 0], 5);
    expect(a).toEqual({ at: 5, score: 1, total: 2, wrong: ['q2'] });
    const nb = validateNotebook({ id: 'n', name: 'N', cards: [], quiz, attempts: [a, scoreQuiz(quiz, [1, 0])] })!;
    expect(weakQuestions(nb).map((q) => q.id)).toEqual(['q2', 'q1']);
  });
  it('validates hostile notebook records', () => {
    expect(validateNotebook({ id: 'x', name: '' })).toBeNull();
    const nb = validateNotebook({ id: 'x', name: 'N', cards: [{ id: 'c', q: 'q', a: 'a', ease: 99, due: 'soon' }, { q: 'no id', a: 'a' }], quiz: [{ id: 'q', q: 'q', options: ['a'], answer: 0 }], attempts: [{ at: 1, score: 1, total: 1, wrong: ['ghost'] }, 'junk'] })!;
    expect(nb.cards).toEqual([{ id: 'c', q: 'q', a: 'a', due: 0, interval: 0, ease: 3, reps: 0, lapses: 0 }]);
    expect(nb.quiz).toEqual([]);
    expect(nb.attempts).toEqual([{ at: 1, score: 1, total: 1, wrong: [] }]);
  });
});

describe('notebook store', () => {
  beforeEach(freshDb);
  it('saves a generated set, grades a card and records an attempt', async () => {
    const nb = await createNotebook('Machine learning');
    await addStudySet(nb.id, { flashcards: [{ q: 'Q1', a: 'A1' }], quiz: [{ q: 'Pick', options: ['x', 'y'], answer: 1 }] }, 'cap1', 100);
    let got = (await getNotebook(nb.id))!;
    expect(got.cards[0]).toMatchObject({ q: 'Q1', due: 100, captureId: 'cap1' });
    await gradeCard(nb.id, got.cards[0]!.id, 'good', 200);
    await saveAttempt(nb.id, scoreQuiz(got.quiz, [0], 300));
    got = (await getNotebook(nb.id))!;
    expect(got.cards[0]).toMatchObject({ reps: 1, due: 200 + DAY });
    expect(got.attempts[0]).toMatchObject({ score: 0, total: 1, wrong: [got.quiz[0]!.id] });
  });
});
