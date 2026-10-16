// Node assertion tests for src/core. These import the same ES modules that are
// inlined into the standalone HTML, so what is tested is what ships.
//
//   node tools/test-core.mjs

import assert from 'node:assert/strict';
import { QUESTIONS } from '../src/questions/index.js';
import {
  resolveQuestion, appliesToRuleset, RULESET_CURRENT, RULESET_2027, THEORY_MOCK,
  formatQuestionId, questionIdNumber, correctOption,
} from '../src/core/schema.js';
import { createRng, shuffle, hashString } from '../src/core/rng.js';
import {
  buildExam, defaultConfig, theoryMockConfig, filterQuestions, eligibleQuestions,
  selectOption, submitAnswer, scoreExam, remainingSeconds, isExpired, formatDuration,
  EXAM_MODES, FEEDBACK_IMMEDIATE, FEEDBACK_END, findQuestion,
} from '../src/core/exam.js';
import {
  recordAnswer, overallStats, topicStats, weakTopics, weakTopicKeys, reviewQueue,
  isDue, dueAt, emptyRecord, readiness, suggestedNextStep,
} from '../src/core/stats.js';
import {
  createStore, createMemoryBackend, detectBackend, defaultState, mergeIntoDefaults,
} from '../src/core/storage.js';
import { exportProgress, validateImport, parseAndValidate } from '../src/core/portability.js';
import { DIAGRAMS, DIAGRAM_KEYS, hasDiagram } from '../src/ui/svg.js';
import {
  THEME_PREFERENCES, isValidThemePreference, resolveTheme, toggledPreference,
  themePreferenceLabel, themeToggleDescriptor,
} from '../src/core/theme.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    failures.push({ name, message: e.message });
  }
}

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function makeQuestion(n, over) {
  const o = over || {};
  const id = formatQuestionId(n);
  return {
    id,
    topic: o.topic || 'signs',
    difficulty: o.difficulty || 'beginner',
    rulesets: o.rulesets || [RULESET_CURRENT],
    question: o.question || `Fixture question ${id} about a road rule?`,
    scenario: null,
    svg: null,
    options: [
      { id: 'A', text: `Option A for ${id}`, explanation: `Explanation A for ${id}, long enough to pass the validator.` },
      { id: 'B', text: `Option B for ${id}`, explanation: `Explanation B for ${id}, long enough to pass the validator.` },
      { id: 'C', text: `Option C for ${id}`, explanation: `Explanation C for ${id}, long enough to pass the validator.` },
      { id: 'D', text: `Option D for ${id}`, explanation: `Explanation D for ${id}, long enough to pass the validator.` },
    ],
    correctOptionId: o.correctOptionId || 'B',
    explanation: `Top level explanation for ${id} that is comfortably longer than sixty characters.`,
    realWorldExample: null,
    sourceTitle: 'Official NZ Road Code',
    sourceUrl: 'https://www.nzta.govt.nz/roadcode/',
    sourceSection: 'Fixture section',
    lastVerified: '2026-10-14',
    verified: true,
    tags: o.tags || ['fixture'],
    variant2027: o.variant2027 || null,
  };
}

function makeBank(size, over) {
  const out = [];
  for (let i = 1; i <= size; i += 1) out.push(makeQuestion(i, typeof over === 'function' ? over(i) : over));
  return out;
}

// ---------------------------------------------------------------------------
// rng
// ---------------------------------------------------------------------------

test('createRng is deterministic for the same seed', () => {
  const a = createRng(7);
  const b = createRng(7);
  for (let i = 0; i < 50; i += 1) assert.equal(a(), b());
});

test('createRng differs across seeds', () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notEqual(a(), b());
});

test('rng output stays inside [0,1)', () => {
  const r = createRng('seed-text');
  for (let i = 0; i < 5000; i += 1) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('shuffle preserves every element and does not mutate the input', () => {
  const input = ['A', 'B', 'C', 'D'];
  const copy = input.slice();
  const out = shuffle(input, createRng(3));
  assert.deepEqual(input, copy);
  assert.deepEqual(out.slice().sort(), copy.slice().sort());
});

test('shuffle reaches many permutations rather than rotating', () => {
  const rng = createRng(11);
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(shuffle(['A', 'B', 'C', 'D'], rng).join(''));
  assert.ok(seen.size >= 20, `only ${seen.size} distinct permutations`);
});

test('hashString is stable', () => {
  assert.equal(hashString('NZRC-001'), hashString('NZRC-001'));
  assert.notEqual(hashString('NZRC-001'), hashString('NZRC-002'));
});

// ---------------------------------------------------------------------------
// schema helpers
// ---------------------------------------------------------------------------

test('formatQuestionId / questionIdNumber round-trip', () => {
  assert.equal(formatQuestionId(7), 'NZRC-007');
  assert.equal(questionIdNumber('NZRC-007'), 7);
  assert.ok(Number.isNaN(questionIdNumber('nope')));
});

test('resolveQuestion leaves current-ruleset questions untouched', () => {
  const q = makeQuestion(1);
  assert.equal(resolveQuestion(q, RULESET_CURRENT), q);
});

test('resolveQuestion applies the 2027 variant without mutating the source', () => {
  const q = makeQuestion(1, {
    rulesets: [RULESET_CURRENT, RULESET_2027],
    variant2027: { question: 'Future wording?', correctOptionId: 'D' },
  });
  const r = resolveQuestion(q, RULESET_2027);
  assert.equal(r.question, 'Future wording?');
  assert.equal(r.correctOptionId, 'D');
  assert.equal(q.question.startsWith('Fixture'), true);
  assert.equal(q.correctOptionId, 'B');
});

test('appliesToRuleset gates future-only questions', () => {
  const cur = makeQuestion(1);
  const fut = makeQuestion(2, { rulesets: [RULESET_2027] });
  assert.equal(appliesToRuleset(cur, RULESET_CURRENT), true);
  assert.equal(appliesToRuleset(fut, RULESET_CURRENT), false);
  assert.equal(appliesToRuleset(fut, RULESET_2027), true);
});

// ---------------------------------------------------------------------------
// filtering
// ---------------------------------------------------------------------------

test('filterQuestions filters by topic and difficulty', () => {
  const bank = makeBank(10, (i) => ({
    topic: i <= 5 ? 'signs' : 'speed',
    difficulty: i % 2 ? 'beginner' : 'advanced',
  }));
  const state = defaultState();
  assert.equal(filterQuestions(bank, { topic: 'signs' }, state).length, 5);
  assert.equal(filterQuestions(bank, { topic: 'all', difficulty: 'advanced' }, state).length, 5);
  // ids 6-10 are 'speed'; 7 and 9 are the odd (beginner) ones.
  assert.equal(filterQuestions(bank, { topic: 'speed', difficulty: 'beginner' }, state).length, 2);
});

test('filterQuestions honours the unanswered / incorrect / bookmarked selections', () => {
  const bank = makeBank(6);
  const state = defaultState();
  recordAnswer(state, 'NZRC-001', true, 1000);
  recordAnswer(state, 'NZRC-002', false, 1000);
  state.bookmarks.push('NZRC-003');

  assert.equal(filterQuestions(bank, { selection: 'unanswered' }, state).length, 4);
  const inc = filterQuestions(bank, { selection: 'incorrect' }, state);
  assert.deepEqual(inc.map((q) => q.id), ['NZRC-002']);
  const bm = filterQuestions(bank, { selection: 'bookmarked' }, state);
  assert.deepEqual(bm.map((q) => q.id), ['NZRC-003']);
});

test('filterQuestions searches question text, options, id and tags', () => {
  const bank = makeBank(3, (i) => ({ tags: i === 2 ? ['roundabout'] : ['fixture'] }));
  const state = defaultState();
  assert.equal(filterQuestions(bank, { search: 'roundabout' }, state).length, 1);
  assert.equal(filterQuestions(bank, { search: 'NZRC-003' }, state).length, 1);
  assert.equal(filterQuestions(bank, { search: 'Option C for NZRC-001' }, state).length, 1);
  assert.equal(filterQuestions(bank, { search: 'zzzz' }, state).length, 0);
});

test('filterQuestions excludes questions outside the selected ruleset', () => {
  const bank = [makeQuestion(1), makeQuestion(2, { rulesets: [RULESET_2027] })];
  const state = defaultState();
  assert.equal(filterQuestions(bank, { ruleset: RULESET_CURRENT }, state).length, 1);
  assert.equal(filterQuestions(bank, { ruleset: RULESET_2027 }, state).length, 1);
});

test('eligibleQuestions restricts the restricted module to its topics and tags', () => {
  const bank = [
    makeQuestion(1, { topic: 'signs', tags: ['road-sign'] }),
    makeQuestion(2, { topic: 'restricted', tags: ['conditions'] }),
    makeQuestion(3, { topic: 'speed', tags: ['blind-spot'] }),
  ];
  const state = defaultState();
  const cfg = defaultConfig({ mode: EXAM_MODES.RESTRICTED, count: 'all' });
  const out = eligibleQuestions(bank, cfg, state);
  assert.deepEqual(out.map((q) => q.id).sort(), ['NZRC-002', 'NZRC-003']);
});

test('eligibleQuestions narrows weak-topic practice to the supplied topics', () => {
  const bank = makeBank(6, (i) => ({ topic: i <= 3 ? 'signs' : 'speed' }));
  const state = defaultState();
  const cfg = defaultConfig({ mode: EXAM_MODES.WEAK_TOPICS, count: 'all' });
  const out = eligibleQuestions(bank, cfg, state, ['speed']);
  assert.equal(out.length, 3);
  assert.ok(out.every((q) => q.topic === 'speed'));
});

// ---------------------------------------------------------------------------
// exam construction
// ---------------------------------------------------------------------------

test('buildExam returns the requested number of questions', () => {
  const exam = buildExam(makeBank(50), defaultConfig({ count: 20 }), defaultState(), { seed: 1, now: 0 });
  assert.equal(exam.items.length, 20);
  assert.equal(exam.truncated, false);
  assert.equal(exam.available, 50);
});

test('buildExam flags truncation instead of silently shortening', () => {
  const exam = buildExam(makeBank(8), defaultConfig({ count: 35 }), defaultState(), { seed: 1, now: 0 });
  assert.equal(exam.items.length, 8);
  assert.equal(exam.requested, 35);
  assert.equal(exam.available, 8);
  assert.equal(exam.truncated, true);
});

test('buildExam count "all" takes the whole eligible pool', () => {
  const exam = buildExam(makeBank(13), defaultConfig({ count: 'all' }), defaultState(), { seed: 2, now: 0 });
  assert.equal(exam.items.length, 13);
  assert.equal(exam.truncated, false);
});

test('buildExam copes with an empty pool', () => {
  const exam = buildExam([], defaultConfig({ count: 10 }), defaultState(), { seed: 1, now: 0 });
  assert.equal(exam.items.length, 0);
  assert.equal(exam.available, 0);
  assert.equal(exam.truncated, true);
});

test('buildExam never repeats a question within one exam', () => {
  const exam = buildExam(makeBank(60), defaultConfig({ count: 35 }), defaultState(), { seed: 9, now: 0 });
  assert.equal(new Set(exam.items.map((i) => i.qid)).size, exam.items.length);
});

test('buildExam is reproducible for a seed and varies across seeds', () => {
  const bank = makeBank(60);
  const a = buildExam(bank, defaultConfig({ count: 10 }), defaultState(), { seed: 5, now: 0 });
  const b = buildExam(bank, defaultConfig({ count: 10 }), defaultState(), { seed: 5, now: 0 });
  const c = buildExam(bank, defaultConfig({ count: 10 }), defaultState(), { seed: 6, now: 0 });
  assert.deepEqual(a.items.map((i) => i.qid), b.items.map((i) => i.qid));
  assert.notDeepEqual(a.items.map((i) => i.qid), c.items.map((i) => i.qid));
});

test('option order is shuffled but every option survives exactly once', () => {
  const bank = makeBank(40);
  const exam = buildExam(bank, defaultConfig({ count: 40 }), defaultState(), { seed: 3, now: 0 });
  let anyReordered = false;
  exam.items.forEach((item) => {
    assert.equal(item.order.length, 4);
    assert.equal(new Set(item.order).size, 4);
    if (item.order.join('') !== 'ABCD') anyReordered = true;
  });
  assert.ok(anyReordered, 'no question was actually reordered');
});

test('shuffleOptions:false keeps the authored order', () => {
  const exam = buildExam(makeBank(5), defaultConfig({ count: 5, shuffleOptions: false }), defaultState(), { seed: 1, now: 0 });
  exam.items.forEach((i) => assert.deepEqual(i.order, ['A', 'B', 'C', 'D']));
});

test('shuffling preserves the binding between the correct option, its text and its explanation', () => {
  const bank = makeBank(30, (i) => ({ correctOptionId: ['A', 'B', 'C', 'D'][i % 4] }));
  for (let seed = 0; seed < 250; seed += 1) {
    const exam = buildExam(bank, defaultConfig({ count: 30 }), defaultState(), { seed, now: 0 });
    exam.items.forEach((item) => {
      const q = findQuestion(bank, item.qid);
      const displayed = item.order.map((oid) => q.options.find((o) => o.id === oid));
      assert.ok(displayed.every(Boolean));
      const shown = displayed.find((o) => o.id === q.correctOptionId);
      const source = correctOption(q);
      assert.equal(shown.text, source.text);
      assert.equal(shown.explanation, source.explanation);
    });
  }
});

test('review-incorrect ordering puts the most-missed questions first', () => {
  const bank = makeBank(5);
  const state = defaultState();
  for (let i = 0; i < 3; i += 1) recordAnswer(state, 'NZRC-004', false, 1000);
  recordAnswer(state, 'NZRC-002', false, 1000);
  recordAnswer(state, 'NZRC-001', false, 1000);
  const exam = buildExam(
    bank,
    defaultConfig({ mode: EXAM_MODES.REVIEW_INCORRECT, count: 'all' }),
    state,
    { seed: 1, now: 0 },
  );
  assert.equal(exam.items[0].qid, 'NZRC-004');
  assert.equal(exam.items.length, 3);
});

// ---------------------------------------------------------------------------
// answering and locking
// ---------------------------------------------------------------------------

test('immediate-feedback mode locks the answer once submitted', () => {
  const exam = buildExam(makeBank(3), defaultConfig({ count: 3, feedback: FEEDBACK_IMMEDIATE }), defaultState(), { seed: 1, now: 0 });
  selectOption(exam, 0, 'A');
  submitAnswer(exam, 0, 1000);
  selectOption(exam, 0, 'C');
  assert.equal(exam.items[0].selectedOptionId, 'A');
  assert.equal(exam.items[0].submitted, true);
});

test('end-of-exam mode allows the answer to be changed before final submit', () => {
  const exam = buildExam(makeBank(3), defaultConfig({ count: 3, feedback: FEEDBACK_END }), defaultState(), { seed: 1, now: 0 });
  selectOption(exam, 0, 'A');
  selectOption(exam, 0, 'C');
  assert.equal(exam.items[0].selectedOptionId, 'C');
});

test('submitAnswer refuses to submit a blank answer', () => {
  const exam = buildExam(makeBank(3), defaultConfig({ count: 3 }), defaultState(), { seed: 1, now: 0 });
  submitAnswer(exam, 0, 1000);
  assert.equal(exam.items[0].submitted, false);
});

test('selectOption rejects an option id outside A-D', () => {
  const exam = buildExam(makeBank(2), defaultConfig({ count: 2 }), defaultState(), { seed: 1, now: 0 });
  selectOption(exam, 0, 'E');
  assert.equal(exam.items[0].selectedOptionId, null);
});

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

test('scoreExam counts correct, incorrect and unanswered separately', () => {
  const bank = makeBank(4, () => ({ correctOptionId: 'B' }));
  const exam = buildExam(bank, defaultConfig({ count: 4 }), defaultState(), { seed: 1, now: 0 });
  selectOption(exam, 0, 'B');
  selectOption(exam, 1, 'B');
  selectOption(exam, 2, 'A');
  // item 3 left blank
  exam.completed = true;
  exam.finishedAt = 60000;
  const r = scoreExam(bank, exam, 60000);
  assert.equal(r.correct, 2);
  assert.equal(r.incorrect, 1);
  assert.equal(r.unanswered, 1);
  assert.equal(r.total, 4);
  assert.equal(r.percent, 50);
  assert.equal(r.elapsedSeconds, 60);
});

test('a blank answer is never scored as correct', () => {
  const bank = makeBank(3, () => ({ correctOptionId: 'B' }));
  const exam = buildExam(bank, defaultConfig({ count: 3 }), defaultState(), { seed: 1, now: 0 });
  exam.completed = true;
  const r = scoreExam(bank, exam, 0);
  assert.equal(r.correct, 0);
  assert.equal(r.unanswered, 3);
});

test('the 32/35 benchmark applies only to a completed full-length theory mock', () => {
  const bank = makeBank(40, () => ({ correctOptionId: 'B' }));
  const state = defaultState();

  const mock = buildExam(bank, theoryMockConfig(), state, { seed: 1, now: 0 });
  mock.items.forEach((_, i) => selectOption(mock, i, 'B'));
  mock.completed = true;
  mock.finishedAt = 1000;
  const r1 = scoreExam(bank, mock, 1000);
  assert.equal(r1.total, THEORY_MOCK.questionCount);
  assert.equal(r1.passApplicable, true);
  assert.equal(r1.passed, true);

  const abandoned = buildExam(bank, theoryMockConfig(), state, { seed: 2, now: 0 });
  abandoned.items.forEach((_, i) => selectOption(abandoned, i, 'B'));
  abandoned.completed = true;
  abandoned.abandoned = true;
  assert.equal(scoreExam(bank, abandoned, 1000).passApplicable, false);

  const unfinished = buildExam(bank, theoryMockConfig(), state, { seed: 3, now: 0 });
  assert.equal(scoreExam(bank, unfinished, 1000).passApplicable, false);

  const custom = buildExam(bank, defaultConfig({ count: 35 }), state, { seed: 4, now: 0 });
  custom.completed = true;
  assert.equal(scoreExam(bank, custom, 1000).passApplicable, false);

  const shortMock = buildExam(bank, theoryMockConfig({ count: 10 }), state, { seed: 5, now: 0 });
  shortMock.completed = true;
  assert.equal(scoreExam(bank, shortMock, 1000).passApplicable, false);
});

test('31 out of 35 is below the benchmark', () => {
  const bank = makeBank(40, () => ({ correctOptionId: 'B' }));
  const mock = buildExam(bank, theoryMockConfig(), defaultState(), { seed: 1, now: 0 });
  mock.items.forEach((_, i) => selectOption(mock, i, i < 31 ? 'B' : 'A'));
  mock.completed = true;
  const r = scoreExam(bank, mock, 1000);
  assert.equal(r.correct, 31);
  assert.equal(r.passed, false);
});

test('scoreExam breaks results down by topic and suggests revision', () => {
  const bank = makeBank(8, (i) => ({ topic: i <= 4 ? 'signs' : 'speed', correctOptionId: 'B' }));
  const exam = buildExam(bank, defaultConfig({ count: 8, shuffleQuestions: false }), defaultState(), { seed: 1, now: 0 });
  exam.items.forEach((item, i) => selectOption(exam, i, bank.findIndex((q) => q.id === item.qid) < 4 ? 'B' : 'A'));
  exam.completed = true;
  const r = scoreExam(bank, exam, 0);
  const signs = r.topics.find((t) => t.topic === 'signs');
  const speed = r.topics.find((t) => t.topic === 'speed');
  assert.equal(signs.correct, 4);
  assert.equal(speed.correct, 0);
  assert.ok(r.suggestedRevision.includes('speed'));
  assert.ok(!r.suggestedRevision.includes('signs'));
});

test('scoring respects the 2027 variant answer key', () => {
  const q = makeQuestion(1, {
    rulesets: [RULESET_CURRENT, RULESET_2027],
    correctOptionId: 'B',
    variant2027: { correctOptionId: 'D' },
  });
  const bank = [q];
  const current = buildExam(bank, defaultConfig({ count: 1, ruleset: RULESET_CURRENT }), defaultState(), { seed: 1, now: 0 });
  selectOption(current, 0, 'B');
  current.completed = true;
  assert.equal(scoreExam(bank, current, 0).correct, 1);

  const future = buildExam(bank, defaultConfig({ count: 1, ruleset: RULESET_2027 }), defaultState(), { seed: 1, now: 0 });
  selectOption(future, 0, 'B');
  future.completed = true;
  assert.equal(scoreExam(bank, future, 0).correct, 0);
});

// ---------------------------------------------------------------------------
// timer
// ---------------------------------------------------------------------------

test('remainingSeconds counts down and never goes negative', () => {
  const exam = buildExam(makeBank(5), theoryMockConfig({ count: 5 }), defaultState(), { seed: 1, now: 0 });
  assert.equal(remainingSeconds(exam, 0), 1800);
  assert.equal(remainingSeconds(exam, 60000), 1740);
  assert.equal(remainingSeconds(exam, 1800000), 0);
  assert.equal(remainingSeconds(exam, 9999999), 0);
  assert.equal(isExpired(exam, 1799000), false);
  assert.equal(isExpired(exam, 1800000), true);
});

test('an untimed exam has no countdown', () => {
  const exam = buildExam(makeBank(5), defaultConfig({ count: 5, timed: false }), defaultState(), { seed: 1, now: 0 });
  assert.equal(remainingSeconds(exam, 999999), null);
  assert.equal(isExpired(exam, 999999), false);
});

test('formatDuration renders mm:ss and hours', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(1800), '30:00');
  assert.equal(formatDuration(-5), '0:00');
  assert.equal(formatDuration(3660), '1h 01m');
});

// ---------------------------------------------------------------------------
// stats and spaced repetition
// ---------------------------------------------------------------------------

test('recordAnswer promotes on a correct answer and resets on a miss', () => {
  const state = defaultState();
  recordAnswer(state, 'NZRC-001', true, 1000);
  assert.equal(state.answers['NZRC-001'].box, 1);
  recordAnswer(state, 'NZRC-001', true, 2000);
  assert.equal(state.answers['NZRC-001'].box, 2);
  recordAnswer(state, 'NZRC-001', false, 3000);
  assert.equal(state.answers['NZRC-001'].box, 0);
  assert.equal(state.answers['NZRC-001'].attempts, 3);
  assert.equal(state.answers['NZRC-001'].correct, 2);
  assert.equal(state.answers['NZRC-001'].incorrect, 1);
  assert.equal(state.answers['NZRC-001'].lastResult, 'incorrect');
});

test('a correct-but-low-confidence answer is held back in the schedule', () => {
  const state = defaultState();
  recordAnswer(state, 'NZRC-001', true, 1000, 'high');
  recordAnswer(state, 'NZRC-001', true, 2000, 'high');
  assert.equal(state.answers['NZRC-001'].box, 2);
  recordAnswer(state, 'NZRC-001', true, 3000, 'low');
  assert.equal(state.answers['NZRC-001'].box, 1);
  assert.equal(state.answers['NZRC-001'].lastConfidence, 'low');
});

test('isDue treats unseen questions as due and respects the interval', () => {
  const day = 24 * 60 * 60 * 1000;
  assert.equal(isDue(null, 0), true);
  assert.equal(isDue(emptyRecord(), 0), true);
  const rec = { ...emptyRecord(), attempts: 1, box: 2, lastAnsweredAt: 0 };
  assert.equal(dueAt(rec), 3 * day);
  assert.equal(isDue(rec, 2 * day), false);
  assert.equal(isDue(rec, 3 * day), true);
});

test('reviewQueue prioritises the most-missed questions', () => {
  const bank = makeBank(4);
  const state = defaultState();
  recordAnswer(state, 'NZRC-001', false, 0);
  recordAnswer(state, 'NZRC-001', false, 0);
  recordAnswer(state, 'NZRC-002', false, 0);
  const q = reviewQueue(bank, state, 0, RULESET_CURRENT);
  assert.equal(q[0].id, 'NZRC-001');
  assert.equal(q[1].id, 'NZRC-002');
});

test('overallStats reports accuracy over attempts, not over questions', () => {
  const bank = makeBank(10);
  const state = defaultState();
  recordAnswer(state, 'NZRC-001', true, 0);
  recordAnswer(state, 'NZRC-001', false, 0);
  recordAnswer(state, 'NZRC-002', true, 0);
  const s = overallStats(bank, state, RULESET_CURRENT);
  assert.equal(s.totalQuestions, 10);
  assert.equal(s.questionsAttempted, 2);
  assert.equal(s.questionsRemaining, 8);
  assert.equal(s.totalAttempts, 3);
  assert.equal(s.accuracy, 66.7);
  assert.equal(s.currentlyIncorrect, 1);
});

test('weakTopics ranks by accuracy and ignores thin samples', () => {
  const bank = makeBank(12, (i) => ({ topic: i <= 6 ? 'signs' : 'speed' }));
  const state = defaultState();
  ['NZRC-001', 'NZRC-002', 'NZRC-003', 'NZRC-004'].forEach((id) => recordAnswer(state, id, false, 0));
  ['NZRC-007', 'NZRC-008', 'NZRC-009'].forEach((id) => recordAnswer(state, id, true, 0));
  const { weak } = weakTopics(bank, state, RULESET_CURRENT);
  assert.equal(weak.length, 1);
  assert.equal(weak[0].key, 'signs');
  assert.equal(weak[0].accuracy, 0);
});

test('weakTopicKeys falls back to untouched topics when nothing is measurably weak', () => {
  const bank = makeBank(6, (i) => ({ topic: i <= 3 ? 'signs' : 'speed' }));
  const state = defaultState();
  ['NZRC-001', 'NZRC-002', 'NZRC-003'].forEach((id) => recordAnswer(state, id, true, 0));
  const keys = weakTopicKeys(bank, state, RULESET_CURRENT);
  assert.ok(keys.includes('speed'));
  assert.ok(!keys.includes('signs'));
});

test('topicStats reports coverage per topic', () => {
  const bank = makeBank(4, () => ({ topic: 'signs' }));
  const state = defaultState();
  recordAnswer(state, 'NZRC-001', true, 0);
  const signs = topicStats(bank, state, RULESET_CURRENT).find((t) => t.key === 'signs');
  assert.equal(signs.total, 4);
  assert.equal(signs.attempted, 1);
  assert.equal(signs.coverage, 25);
});

// ---------------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------------

test('store round-trips state through the backend', () => {
  const backend = createMemoryBackend();
  const store = createStore({ backend, persistent: true, reason: null });
  store.update((s) => { s.bookmarks.push('NZRC-001'); });
  const reopened = createStore({ backend, persistent: true, reason: null });
  assert.deepEqual(reopened.getState().bookmarks, ['NZRC-001']);
});

test('store recovers from a corrupt payload instead of throwing', () => {
  const backend = createMemoryBackend();
  backend.setItem('nzrcm.v1.state', '{not json');
  const store = createStore({ backend, persistent: true, reason: null });
  assert.deepEqual(store.getState().bookmarks, []);
});

test('store keeps working when the backend refuses to write', () => {
  const backend = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  };
  const store = createStore({ backend, persistent: true, reason: null });
  store.update((s) => { s.bookmarks.push('NZRC-001'); });
  assert.deepEqual(store.getState().bookmarks, ['NZRC-001']);
  assert.equal(store.persistent, false);
});

test('detectBackend falls back to memory when localStorage is missing', () => {
  const info = detectBackend({});
  assert.equal(info.persistent, false);
  assert.ok(info.reason);
  info.backend.setItem('k', 'v');
  assert.equal(info.backend.getItem('k'), 'v');
});

test('store reset clears everything', () => {
  const backend = createMemoryBackend();
  const store = createStore({ backend, persistent: true, reason: null });
  store.update((s) => { s.bookmarks.push('NZRC-001'); s.history.push({ total: 1 }); });
  store.reset();
  assert.deepEqual(store.getState().bookmarks, []);
  assert.deepEqual(store.getState().history, []);
});

test('mergeIntoDefaults repairs partial and hostile payloads', () => {
  const merged = mergeIntoDefaults({ bookmarks: ['NZRC-001', 7, null], answers: ['not', 'an', 'object'], extra: 'dropped' });
  assert.deepEqual(merged.bookmarks, ['NZRC-001']);
  assert.deepEqual(merged.answers, {});
  assert.equal(merged.extra, undefined);
  assert.equal(mergeIntoDefaults(null).version, 1);
});

// ---------------------------------------------------------------------------
// export / import
// ---------------------------------------------------------------------------

test('export then import round-trips progress', () => {
  const state = defaultState();
  recordAnswer(state, 'NZRC-001', true, 1000);
  state.bookmarks.push('NZRC-002');
  state.history.push({
    examId: 'e1', mode: 'theory-mock', ruleset: 'current', finishedAt: 10,
    total: 35, correct: 33, incorrect: 2, unanswered: 0, percent: 94.3,
    elapsedSeconds: 600, passApplicable: true, passed: true, incorrectIds: ['NZRC-003'],
  });
  const payload = exportProgress(state, '2026-10-14T00:00:00Z');
  const text = JSON.stringify(payload);
  const result = parseAndValidate(text, ['NZRC-001', 'NZRC-002', 'NZRC-003']);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.state.answers['NZRC-001'].correct, 1);
  assert.deepEqual(result.state.bookmarks, ['NZRC-002']);
  assert.equal(result.state.history[0].correct, 33);
  assert.equal(result.state.history[0].passed, true);
});

test('import rejects a foreign format', () => {
  const r = validateImport({ format: 'something-else', formatVersion: 1, state: {} });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Unrecognised file format/);
});

test('import rejects an unsupported version', () => {
  const r = validateImport({ format: 'nz-road-code-master-progress', formatVersion: 99, state: {} });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Unsupported export version/);
});

test('import rejects malformed JSON without throwing', () => {
  const r = parseAndValidate('{nope');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /not valid JSON/);
});

test('import rejects impossible counters', () => {
  const r = validateImport({
    format: 'nz-road-code-master-progress',
    formatVersion: 1,
    state: { answers: { 'NZRC-001': { attempts: 1, correct: 5, incorrect: 5 } } },
  }, ['NZRC-001']);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /exceeds attempts/);
});

test('import drops ids that are not in this bank and warns', () => {
  const r = validateImport({
    format: 'nz-road-code-master-progress',
    formatVersion: 1,
    state: {
      answers: { 'NZRC-999': { attempts: 1, correct: 1, incorrect: 0 } },
      bookmarks: ['NZRC-999', 'NZRC-001'],
    },
  }, ['NZRC-001']);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.state.answers), []);
  assert.deepEqual(r.state.bookmarks, ['NZRC-001']);
  assert.ok(r.warnings.length >= 2);
});

test('import never carries executable content through', () => {
  const r = validateImport({
    format: 'nz-road-code-master-progress',
    formatVersion: 1,
    state: {
      settings: { ruleset: 'current', evil: () => {} },
      answers: { 'NZRC-001': { attempts: 1, correct: 1, incorrect: 0, evil: 'x' } },
      bookmarks: ['<img src=x onerror=alert(1)>'],
    },
  }, ['NZRC-001']);
  assert.equal(r.ok, true);
  assert.equal(r.state.settings.evil, undefined);
  assert.equal(r.state.answers['NZRC-001'].evil, undefined);
  assert.deepEqual(r.state.bookmarks, []);
});

test('import rejects wrong types for the top-level collections', () => {
  const r = validateImport({
    format: 'nz-road-code-master-progress',
    formatVersion: 1,
    state: { answers: 'nope', bookmarks: 'nope', history: 'nope' },
  });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3);
});

// ---------------------------------------------------------------------------
// readiness and next step
// ---------------------------------------------------------------------------

test('readiness refuses to say anything before there is enough practice', () => {
  const bank = makeBank(100);
  const state = defaultState();
  for (let i = 1; i <= 20; i += 1) recordAnswer(state, formatQuestionId(i), true, 0);
  const r = readiness(bank, state, RULESET_CURRENT);
  assert.equal(r.status, 'insufficient');
  assert.equal(r.attempted, 20);
  assert.match(r.detail, /at least 35/);
});

test('readiness will not say "tracking well" without a passed full mock', () => {
  const bank = makeBank(100);
  const state = defaultState();
  // Broad coverage at perfect accuracy, but no mock sat.
  for (let i = 1; i <= 70; i += 1) recordAnswer(state, formatQuestionId(i), true, 0);
  const r = readiness(bank, state, RULESET_CURRENT);
  assert.equal(r.coverage, 70);
  assert.equal(r.accuracy, 100);
  assert.equal(r.status, 'approaching', 'coverage and accuracy alone must not reach "ready"');
  assert.match(r.detail, /full 35-question mock/);
});

test('readiness reaches its top band only on coverage, accuracy and a passed mock', () => {
  const bank = makeBank(100);
  const state = defaultState();
  for (let i = 1; i <= 70; i += 1) recordAnswer(state, formatQuestionId(i), true, 0);
  state.history.push({ mode: 'theory-mock', total: 35, correct: 34, passApplicable: true, passed: true });
  const r = readiness(bank, state, RULESET_CURRENT);
  assert.equal(r.status, 'ready');
  assert.equal(r.mocksPassed, 1);
  assert.equal(r.bestMock, 34);
});

test('readiness drops back to building when accuracy is poor', () => {
  const bank = makeBank(100);
  const state = defaultState();
  for (let i = 1; i <= 60; i += 1) recordAnswer(state, formatQuestionId(i), i % 2 === 0, 0);
  const r = readiness(bank, state, RULESET_CURRENT);
  assert.equal(r.accuracy, 50);
  assert.equal(r.status, 'building');
});

test('readiness always reports the figures behind its verdict', () => {
  const bank = makeBank(100);
  const state = defaultState();
  for (let i = 1; i <= 50; i += 1) recordAnswer(state, formatQuestionId(i), true, 0);
  const r = readiness(bank, state, RULESET_CURRENT);
  ['attempted', 'totalQuestions', 'coverage', 'accuracy', 'mocksTaken', 'mocksPassed'].forEach((k) => {
    assert.ok(r[k] !== undefined, `readiness is missing ${k}`);
  });
  assert.ok(r.detail.includes(String(r.coverage)), 'the detail line does not show its working');
});

test('the suggested next step follows what the learner has actually done', () => {
  assert.equal(suggestedNextStep({ hasUnfinishedExam: true, attempted: 90 }), 'resume',
    'an unfinished exam always wins');
  assert.equal(suggestedNextStep({ attempted: 0 }), 'taster',
    'a first-time visitor should be offered a question, not a configuration screen');
  assert.equal(suggestedNextStep({ attempted: 40, incorrectCount: 9 }), 'review-incorrect');
  assert.equal(suggestedNextStep({ attempted: 40, incorrectCount: 1, weakCount: 2 }), 'weak-topics');
  assert.equal(suggestedNextStep({ attempted: 40, incorrectCount: 0, weakCount: 0 }), 'theory-mock');
  assert.equal(suggestedNextStep({}), 'taster', 'no data at all means start with a taster');
});

test('a few answers do not trigger weak-topic practice prematurely', () => {
  // Below 20 attempts there is not enough signal to call a topic weak.
  assert.equal(suggestedNextStep({ attempted: 8, incorrectCount: 2, weakCount: 3 }), 'theory-mock');
});

// ---------------------------------------------------------------------------
// theme preference
// ---------------------------------------------------------------------------

test('resolveTheme follows the system only when the preference is system', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('dark', false), 'dark', 'an explicit dark choice must win');
  assert.equal(resolveTheme('light', true), 'light', 'an explicit light choice must win');
});

test('resolveTheme falls back to following the system for junk input', () => {
  assert.equal(resolveTheme(undefined, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('neon', true), 'dark');
  assert.equal(resolveTheme(7, false), 'light');
});

test('isValidThemePreference accepts only the three preferences', () => {
  ['system', 'light', 'dark'].forEach((p) => assert.equal(isValidThemePreference(p), true, p));
  [undefined, null, '', 'Dark', 'auto', 0, {}].forEach((p) => assert.equal(isValidThemePreference(p), false));
  assert.deepEqual(THEME_PREFERENCES, ['system', 'light', 'dark']);
});

test('toggling always produces an explicit preference, never system', () => {
  assert.equal(toggledPreference('light', false), 'dark');
  assert.equal(toggledPreference('dark', false), 'light');
  // Following a dark system and pressing the button means "give me light".
  assert.equal(toggledPreference('system', true), 'light');
  assert.equal(toggledPreference('system', false), 'dark');
});

test('toggling twice returns to the theme you started from', () => {
  [true, false].forEach((systemDark) => {
    ['system', 'light', 'dark'].forEach((start) => {
      const once = toggledPreference(start, systemDark);
      const twice = toggledPreference(once, systemDark);
      assert.equal(
        resolveTheme(twice, systemDark),
        resolveTheme(start, systemDark),
        `round trip failed from ${start} with systemDark=${systemDark}`,
      );
    });
  });
});

test('the toggle is described by what it will do, not its current state', () => {
  const inLight = themeToggleDescriptor('light', false);
  assert.equal(inLight.resolved, 'light');
  assert.equal(inLight.next, 'dark');
  assert.match(inLight.ariaLabel, /switch to the dark theme/i);

  const inDark = themeToggleDescriptor('dark', false);
  assert.equal(inDark.resolved, 'dark');
  assert.equal(inDark.next, 'light');
  assert.match(inDark.ariaLabel, /switch to the light theme/i);

  assert.notEqual(inLight.glyph, inDark.glyph, 'the two states share a glyph');
});

test('theme preference labels are human readable', () => {
  assert.equal(themePreferenceLabel('light'), 'Light');
  assert.equal(themePreferenceLabel('dark'), 'Dark');
  assert.equal(themePreferenceLabel('system'), 'Follow system');
  assert.equal(themePreferenceLabel('nonsense'), 'Follow system');
});

test('a theme preference survives a storage round-trip', () => {
  const backend = createMemoryBackend();
  const store = createStore({ backend, persistent: true, reason: null });
  assert.equal(store.getState().settings.theme, 'system', 'default should follow the system');
  store.update((s) => { s.settings.theme = 'dark'; });
  assert.equal(createStore({ backend, persistent: true, reason: null }).getState().settings.theme, 'dark');
});

test('an invalid stored theme is repaired rather than applied', () => {
  assert.equal(mergeIntoDefaults({ settings: { theme: 'neon' } }).settings.theme, 'system');
  assert.equal(mergeIntoDefaults({ settings: { theme: 'dark' } }).settings.theme, 'dark');
});

test('import carries a valid theme and rejects an invalid one', () => {
  const build = (theme) => validateImport({
    format: 'nz-road-code-master-progress',
    formatVersion: 1,
    state: { settings: { ruleset: 'current', theme } },
  }, ['NZRC-001']);
  assert.equal(build('dark').state.settings.theme, 'dark');
  assert.equal(build('light').state.settings.theme, 'light');
  assert.equal(build('neon').state.settings.theme, 'system', 'junk should fall back, not apply');
  assert.equal(build(undefined).state.settings.theme, 'system');
});

// ---------------------------------------------------------------------------
// diagram registry
// ---------------------------------------------------------------------------

// A malformed diagram would fail silently in the browser (DOMParser returns a
// parsererror and the app shows "Diagram unavailable"), so check the markup is
// well formed here instead.
function checkWellFormed(markup) {
  const stack = [];
  const re = /<\/?([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
  let m = re.exec(markup);
  while (m) {
    const [, name, attrs, selfClose] = m;
    const isClose = m[0].startsWith('</');
    if (isClose) {
      const open = stack.pop();
      if (open !== name) throw new Error(`closing </${name}> does not match <${open || 'nothing'}>`);
    } else if (!selfClose) {
      stack.push(name);
    }
    // Every attribute value must be quoted.
    const bad = attrs.match(/[\w:-]+\s*=\s*(?!["'])/);
    if (bad) throw new Error(`unquoted attribute near "${m[0].slice(0, 60)}"`);
    m = re.exec(markup);
  }
  if (stack.length) throw new Error(`unclosed element <${stack[stack.length - 1]}>`);
}

test('every diagram is well-formed SVG with a title and a viewBox', () => {
  assert.ok(DIAGRAM_KEYS.length >= 20, `only ${DIAGRAM_KEYS.length} diagrams`);
  DIAGRAM_KEYS.forEach((key) => {
    const d = DIAGRAMS[key];
    try {
      checkWellFormed(d.markup);
    } catch (e) {
      throw new Error(`${key}: ${e.message}`);
    }
    assert.ok(d.markup.startsWith('<svg '), `${key}: does not start with <svg`);
    assert.ok(d.markup.includes('viewBox='), `${key}: no viewBox`);
    assert.ok(d.markup.includes('<title '), `${key}: no <title> for assistive technology`);
    assert.ok(d.title && d.title.length > 30, `${key}: alt text is too thin`);
    assert.ok(d.caption && d.caption.length > 10, `${key}: no caption`);
    // The SVG namespace URI is a name, not a fetch; nothing else remote is allowed.
    const remote = d.markup.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
    assert.ok(!/https?:\/\//.test(remote), `${key}: references a remote resource`);
  });
});

test('diagram ids are unique so markers cannot collide on one page', () => {
  const ids = [];
  DIAGRAM_KEYS.forEach((key) => {
    const matches = DIAGRAMS[key].markup.match(/\sid="([^"]+)"/g) || [];
    matches.forEach((raw) => ids.push(raw));
  });
  const counts = {};
  ids.forEach((i) => { counts[i] = (counts[i] || 0) + 1; });
  const dupes = Object.keys(counts).filter((k) => counts[k] > 1);
  assert.deepEqual(dupes, [], `duplicate ids across diagrams: ${dupes.join(', ')}`);
});

test('every question that references a diagram references one that exists', () => {
  QUESTIONS.filter((q) => q.svg).forEach((q) => {
    assert.ok(hasDiagram(q.svg), `${q.id} references unknown diagram "${q.svg}"`);
  });
});

// ---------------------------------------------------------------------------
// the real bank, once it exists
// ---------------------------------------------------------------------------

if (QUESTIONS.length) {
  test('[real bank] every exam mode can be constructed without throwing', () => {
    const state = defaultState();
    state.bookmarks.push(QUESTIONS[0].id);
    recordAnswer(state, QUESTIONS[1].id, false, 0);
    Object.values(EXAM_MODES).forEach((mode) => {
      const exam = buildExam(
        QUESTIONS,
        defaultConfig({ mode, count: 10 }),
        state,
        { seed: 1, now: 0, weakTopicKeys: weakTopicKeys(QUESTIONS, state, RULESET_CURRENT) },
      );
      assert.ok(Array.isArray(exam.items), `${mode} produced no items array`);
    });
  });

  test('[real bank] a full theory mock can be built and scored', () => {
    const state = defaultState();
    const exam = buildExam(QUESTIONS, theoryMockConfig(), state, { seed: 7, now: 0 });
    assert.equal(exam.items.length, THEORY_MOCK.questionCount);
    exam.items.forEach((item, i) => {
      const q = findQuestion(QUESTIONS, item.qid);
      selectOption(exam, i, q.correctOptionId);
    });
    exam.completed = true;
    exam.finishedAt = 60000;
    const r = scoreExam(QUESTIONS, exam, 60000);
    assert.equal(r.correct, THEORY_MOCK.questionCount);
    assert.equal(r.passed, true);
  });

  test('[real bank] shuffle integrity holds across 1000 draws', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const exam = buildExam(QUESTIONS, defaultConfig({ count: 25 }), defaultState(), { seed, now: 0 });
      exam.items.forEach((item) => {
        const q = findQuestion(QUESTIONS, item.qid);
        const shown = item.order.map((oid) => q.options.find((o) => o.id === oid));
        assert.equal(new Set(shown.map((o) => o.id)).size, 4);
        const c = shown.find((o) => o.id === q.correctOptionId);
        assert.equal(c.explanation, correctOption(q).explanation);
      });
    }
  });

  test('[real bank] every topic can supply a 10-question practice set', () => {
    const state = defaultState();
    const topics = [...new Set(QUESTIONS.map((q) => q.topic))];
    topics.forEach((topic) => {
      const exam = buildExam(QUESTIONS, defaultConfig({ topic, count: 10 }), state, { seed: 1, now: 0 });
      assert.ok(exam.items.length >= 10, `${topic} only supplied ${exam.items.length}`);
    });
  });

  test('[real bank] the 2027 ruleset resolves without losing questions', () => {
    const cur = filterQuestions(QUESTIONS, { ruleset: RULESET_CURRENT }, defaultState());
    const fut = filterQuestions(QUESTIONS, { ruleset: RULESET_2027 }, defaultState());
    assert.ok(cur.length > 0);
    assert.ok(fut.length > 0);
    fut.forEach((q) => {
      const r = resolveQuestion(q, RULESET_2027);
      assert.equal(r.options.length, 4);
      assert.ok(r.options.some((o) => o.id === r.correctOptionId));
    });
  });
}

// ---------------------------------------------------------------------------

console.log('');
if (failures.length) {
  console.log(`FAILURES (${failures.length})`);
  failures.forEach((f) => console.log(`  x ${f.name}\n      ${f.message.split('\n')[0]}`));
  console.log('');
}
console.log(`${passed} passed, ${failed} failed  (${QUESTIONS.length} questions in the bank)`);
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
