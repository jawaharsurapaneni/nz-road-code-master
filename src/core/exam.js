// Exam construction, question selection/filtering, option shuffling and
// scoring. Deliberately free of DOM references so it can be unit-tested in
// Node and inlined into the standalone HTML unchanged.

import {
  OPTION_IDS, DIFFICULTIES, RULESET_CURRENT, THEORY_MOCK,
  appliesToRuleset, resolveQuestion, topicLabel,
  RESTRICTED_MODULE_TOPICS, RESTRICTED_MODULE_TAGS,
} from './schema.js';
import { createRng, shuffle, randomSeed } from './rng.js';

export const EXAM_MODES = Object.freeze({
  THEORY_MOCK: 'theory-mock',
  CUSTOM: 'custom',
  LEARN: 'learn',
  WEAK_TOPICS: 'weak-topics',
  REVIEW_INCORRECT: 'review-incorrect',
  REVIEW_BOOKMARKS: 'review-bookmarks',
  SIGNS: 'signs-practice',
  HAZARD: 'hazard-practice',
  RESTRICTED: 'restricted-module',
});

export const FEEDBACK_IMMEDIATE = 'immediate';
export const FEEDBACK_END = 'end';

export function defaultConfig(overrides) {
  return {
    mode: EXAM_MODES.CUSTOM,
    count: 20,
    topic: 'all',
    difficulty: 'mixed',
    selection: 'random',
    feedback: FEEDBACK_IMMEDIATE,
    timed: false,
    timeLimitSeconds: null,
    ruleset: RULESET_CURRENT,
    shuffleOptions: true,
    shuffleQuestions: true,
    ids: null,
    seed: null,
    ...(overrides || {}),
  };
}

export function theoryMockConfig(overrides) {
  return defaultConfig({
    mode: EXAM_MODES.THEORY_MOCK,
    count: THEORY_MOCK.questionCount,
    feedback: FEEDBACK_END,
    timed: true,
    timeLimitSeconds: THEORY_MOCK.timeLimitSeconds,
    ...(overrides || {}),
  });
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function answerRecord(state, qid) {
  return (state && state.answers && state.answers[qid]) || null;
}

function isBookmarked(state, qid) {
  return !!(state && Array.isArray(state.bookmarks) && state.bookmarks.includes(qid));
}

function hasAnyTag(q, tags) {
  const qt = Array.isArray(q.tags) ? q.tags : [];
  return tags.some((t) => qt.includes(t));
}

/**
 * The single filtering entry point. Used by exam construction, the browse /
 * search screen and the dashboard counters, so there is one definition of
 * "which questions match".
 *
 * criteria: { ruleset, topic, difficulty, selection, tags, ids, search,
 *             bookmarkedOnly, answeredState }
 */
export function filterQuestions(bank, criteria, state) {
  const c = criteria || {};
  const ruleset = c.ruleset || RULESET_CURRENT;
  const search = typeof c.search === 'string' ? c.search.trim().toLowerCase() : '';
  const idSet = Array.isArray(c.ids) && c.ids.length ? new Set(c.ids) : null;

  return bank.filter((q) => {
    if (!appliesToRuleset(q, ruleset)) return false;
    if (idSet && !idSet.has(q.id)) return false;
    if (c.topic && c.topic !== 'all' && q.topic !== c.topic) return false;
    if (c.difficulty && c.difficulty !== 'mixed' && q.difficulty !== c.difficulty) return false;
    if (Array.isArray(c.tags) && c.tags.length && !hasAnyTag(q, c.tags)) return false;
    if (c.bookmarkedOnly && !isBookmarked(state, q.id)) return false;

    if (c.selection && c.selection !== 'random') {
      const rec = answerRecord(state, q.id);
      if (c.selection === 'unanswered' && rec && rec.attempts > 0) return false;
      if (c.selection === 'incorrect' && !(rec && rec.incorrect > 0)) return false;
      if (c.selection === 'bookmarked' && !isBookmarked(state, q.id)) return false;
    }

    if (c.answeredState === 'correct') {
      const rec = answerRecord(state, q.id);
      if (!(rec && rec.lastResult === 'correct')) return false;
    }
    if (c.answeredState === 'incorrect') {
      const rec = answerRecord(state, q.id);
      if (!(rec && rec.lastResult === 'incorrect')) return false;
    }

    if (search) {
      const resolved = resolveQuestion(q, ruleset);
      const haystack = [
        q.id, resolved.question, resolved.scenario || '',
        topicLabel(q.topic), (q.tags || []).join(' '),
        resolved.options.map((o) => o.text).join(' '),
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

// Translates a dashboard mode into the filter criteria it implies.
export function criteriaForMode(config, state, weakTopicKeys) {
  const base = {
    ruleset: config.ruleset,
    topic: config.topic,
    difficulty: config.difficulty,
    selection: config.selection,
    // An explicit id list (retry-incorrect, practise-these, review-due) always
    // narrows the pool, whatever the mode.
    ids: Array.isArray(config.ids) && config.ids.length ? config.ids : null,
  };
  switch (config.mode) {
    case EXAM_MODES.REVIEW_INCORRECT:
      return { ...base, topic: 'all', selection: 'incorrect' };
    case EXAM_MODES.REVIEW_BOOKMARKS:
      return { ...base, topic: 'all', selection: 'bookmarked' };
    case EXAM_MODES.SIGNS:
      return { ...base, topic: 'all', tags: ['road-sign', 'traffic-signal', 'road-marking-sign'] };
    case EXAM_MODES.HAZARD:
      return { ...base, topic: 'all', tags: ['hazard', 'defensive', 'scanning'] };
    case EXAM_MODES.RESTRICTED:
      return { ...base, topic: 'all', restrictedModule: true };
    case EXAM_MODES.WEAK_TOPICS: {
      const keys = Array.isArray(weakTopicKeys) ? weakTopicKeys : [];
      return { ...base, topic: 'all', weakTopics: keys };
    }
    default:
      return base;
  }
}

// The restricted module and weak-topic modes need an extra pass that
// filterQuestions does not express as a plain field.
export function eligibleQuestions(bank, config, state, weakTopicKeys) {
  const criteria = criteriaForMode(config, state, weakTopicKeys);
  let list = filterQuestions(bank, criteria, state);
  if (criteria.restrictedModule) {
    list = list.filter((q) => RESTRICTED_MODULE_TOPICS.includes(q.topic)
      || hasAnyTag(q, RESTRICTED_MODULE_TAGS));
  }
  if (Array.isArray(criteria.weakTopics) && criteria.weakTopics.length) {
    list = list.filter((q) => criteria.weakTopics.includes(q.topic));
  }
  return list;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Shuffles option display order while keeping every option's stable id, text
 * and explanation bound together. The exam stores only the order of stable
 * ids, so the answer key can never drift away from the explanations.
 */
export function shuffledOrder(question, rng, enabled) {
  const ids = question.options.map((o) => o.id);
  return enabled ? shuffle(ids, rng) : ids;
}

/**
 * Builds an exam. Returns a plain serialisable object; `available` and
 * `truncated` let the UI tell the user when a filter could not supply the
 * requested number of questions instead of silently shortening the exam.
 */
export function buildExam(bank, config, state, options) {
  const opts = options || {};
  const cfg = defaultConfig(config);
  const seed = cfg.seed == null ? (opts.seed == null ? randomSeed() : opts.seed) : cfg.seed;
  const rng = createRng(seed);
  const now = opts.now == null ? 0 : opts.now;

  const pool = eligibleQuestions(bank, cfg, state, opts.weakTopicKeys);
  const requested = cfg.count === 'all' ? pool.length : Math.max(0, Number(cfg.count) || 0);

  let ordered = cfg.shuffleQuestions ? shuffle(pool, rng) : pool.slice();
  // Spaced repetition: when revising, surface the most-missed questions first.
  if (cfg.mode === EXAM_MODES.REVIEW_INCORRECT) {
    ordered = ordered.sort((a, b) => missCount(state, b.id) - missCount(state, a.id));
  }
  const chosen = ordered.slice(0, Math.min(requested, ordered.length));

  return {
    id: `exam-${seed}-${now}`,
    seed,
    config: cfg,
    createdAt: now,
    startedAt: now,
    finishedAt: null,
    completed: false,
    abandoned: false,
    cursor: 0,
    timeLimitSeconds: cfg.timed ? (cfg.timeLimitSeconds || null) : null,
    requested,
    available: pool.length,
    truncated: requested > pool.length,
    items: chosen.map((q) => ({
      qid: q.id,
      order: shuffledOrder(q, rng, cfg.shuffleOptions !== false),
      selectedOptionId: null,
      submitted: false,
      confidence: null,
      answeredAt: null,
    })),
  };
}

function missCount(state, qid) {
  const rec = (state && state.answers && state.answers[qid]) || null;
  return rec ? (rec.incorrect || 0) : 0;
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

export function selectOption(exam, index, optionId) {
  const item = exam.items[index];
  if (!item) return exam;
  // Once submitted in immediate-feedback mode the answer is locked. In
  // end-of-exam mode the candidate may keep changing it until final submit.
  if (item.submitted && exam.config.feedback === FEEDBACK_IMMEDIATE) return exam;
  if (!OPTION_IDS.includes(optionId)) return exam;
  item.selectedOptionId = optionId;
  return exam;
}

export function submitAnswer(exam, index, nowMs) {
  const item = exam.items[index];
  if (!item || item.submitted || !item.selectedOptionId) return exam;
  item.submitted = true;
  item.answeredAt = nowMs == null ? 0 : nowMs;
  return exam;
}

export function isCorrect(bank, exam, item) {
  const q = findQuestion(bank, item.qid);
  if (!q) return false;
  const resolved = resolveQuestion(q, exam.config.ruleset);
  // A blank answer is never correct.
  return !!item.selectedOptionId && item.selectedOptionId === resolved.correctOptionId;
}

export function findQuestion(bank, qid) {
  return bank.find((q) => q.id === qid) || null;
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

export function remainingSeconds(exam, nowMs) {
  if (!exam || !exam.timeLimitSeconds) return null;
  const elapsed = Math.floor(((nowMs == null ? 0 : nowMs) - exam.startedAt) / 1000);
  const left = exam.timeLimitSeconds - elapsed;
  return left > 0 ? left : 0; // never negative
}

export function isExpired(exam, nowMs) {
  const left = remainingSeconds(exam, nowMs);
  return left !== null && left <= 0;
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  }
  return `${m}:${String(rem).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Scores a finished exam. `passApplicable` is deliberately narrow: the 32/35
 * benchmark belongs to the full-length learner theory mock only, and only when
 * the exam was actually completed rather than abandoned.
 */
export function scoreExam(bank, exam, nowMs) {
  const byTopic = {};
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  const incorrectIds = [];
  const unansweredIds = [];

  exam.items.forEach((item) => {
    const q = findQuestion(bank, item.qid);
    const topic = q ? q.topic : 'unknown';
    if (!byTopic[topic]) byTopic[topic] = { topic, total: 0, correct: 0, incorrect: 0, unanswered: 0 };
    byTopic[topic].total += 1;

    if (!item.selectedOptionId) {
      unanswered += 1;
      unansweredIds.push(item.qid);
      byTopic[topic].unanswered += 1;
      return;
    }
    if (isCorrect(bank, exam, item)) {
      correct += 1;
      byTopic[topic].correct += 1;
    } else {
      incorrect += 1;
      incorrectIds.push(item.qid);
      byTopic[topic].incorrect += 1;
    }
  });

  const total = exam.items.length;
  const percent = total ? Math.round((correct / total) * 1000) / 10 : 0;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((((exam.finishedAt == null ? nowMs : exam.finishedAt) || 0) - exam.startedAt) / 1000),
  );

  const passApplicable = exam.config.mode === EXAM_MODES.THEORY_MOCK
    && total === THEORY_MOCK.questionCount
    && exam.completed === true
    && exam.abandoned !== true;

  const topics = Object.values(byTopic).map((t) => ({
    ...t,
    label: topicLabel(t.topic),
    accuracy: t.total ? Math.round((t.correct / t.total) * 1000) / 10 : 0,
  })).sort((a, b) => a.accuracy - b.accuracy);

  return {
    examId: exam.id,
    mode: exam.config.mode,
    ruleset: exam.config.ruleset,
    total,
    correct,
    incorrect,
    unanswered,
    percent,
    elapsedSeconds,
    incorrectIds,
    unansweredIds,
    topics,
    passApplicable,
    passMark: THEORY_MOCK.passMark,
    passed: passApplicable ? correct >= THEORY_MOCK.passMark : null,
    // Topics worth revising: below 70% with at least two questions asked.
    suggestedRevision: topics.filter((t) => t.total >= 2 && t.accuracy < 70).map((t) => t.topic),
  };
}

export const DIFFICULTY_LABELS = Object.freeze({
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
});

export function isValidDifficulty(d) {
  return DIFFICULTIES.includes(d);
}
