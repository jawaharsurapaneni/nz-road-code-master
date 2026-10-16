// Progress statistics, weak-topic analysis and the spaced-repetition schedule.

import { TOPICS, topicLabel, appliesToRuleset, RULESET_CURRENT } from './schema.js';

// Leitner-style boxes. A missed question drops to box 0 and comes back almost
// immediately; a repeatedly correct one moves out to three weeks.
export const REVIEW_INTERVAL_DAYS = Object.freeze([0, 1, 3, 7, 21]);
const DAY_MS = 24 * 60 * 60 * 1000;

export function emptyRecord() {
  return {
    attempts: 0,
    correct: 0,
    incorrect: 0,
    lastResult: null,
    lastAnsweredAt: null,
    box: 0,
    lastConfidence: null,
  };
}

/**
 * Records one answer against the persistent state. Mutates `state.answers`
 * in place (callers wrap this in store.update) and returns the record.
 */
export function recordAnswer(state, qid, wasCorrect, nowMs, confidence) {
  if (!state.answers) state.answers = {};
  const rec = state.answers[qid] ? { ...state.answers[qid] } : emptyRecord();
  rec.attempts += 1;
  if (wasCorrect) {
    rec.correct += 1;
    rec.lastResult = 'correct';
    rec.box = Math.min(rec.box + 1, REVIEW_INTERVAL_DAYS.length - 1);
  } else {
    rec.incorrect += 1;
    rec.lastResult = 'incorrect';
    rec.box = 0;
  }
  rec.lastAnsweredAt = nowMs == null ? 0 : nowMs;
  if (confidence === 'low' || confidence === 'medium' || confidence === 'high') {
    rec.lastConfidence = confidence;
    // Answered correctly but with low confidence: treat as not yet learned.
    if (wasCorrect && confidence === 'low') rec.box = Math.min(rec.box, 1);
  }
  state.answers[qid] = rec;
  return rec;
}

export function dueAt(rec) {
  if (!rec || rec.lastAnsweredAt == null) return 0;
  const days = REVIEW_INTERVAL_DAYS[Math.min(rec.box, REVIEW_INTERVAL_DAYS.length - 1)];
  return rec.lastAnsweredAt + days * DAY_MS;
}

export function isDue(rec, nowMs) {
  if (!rec || !rec.attempts) return true; // never attempted
  return dueAt(rec) <= (nowMs == null ? 0 : nowMs);
}

/**
 * Review queue ordered by urgency: never-seen questions, then the ones missed
 * most often, then the most overdue.
 */
export function reviewQueue(bank, state, nowMs, ruleset) {
  const rs = ruleset || RULESET_CURRENT;
  const now = nowMs == null ? 0 : nowMs;
  return bank
    .filter((q) => appliesToRuleset(q, rs))
    .map((q) => ({ q, rec: (state.answers && state.answers[q.id]) || null }))
    .filter((e) => isDue(e.rec, now))
    .sort((a, b) => {
      const aMiss = a.rec ? a.rec.incorrect : 0;
      const bMiss = b.rec ? b.rec.incorrect : 0;
      if (bMiss !== aMiss) return bMiss - aMiss;
      const aSeen = a.rec ? a.rec.attempts : 0;
      const bSeen = b.rec ? b.rec.attempts : 0;
      if (aSeen !== bSeen) return aSeen - bSeen;
      return dueAt(a.rec) - dueAt(b.rec);
    })
    .map((e) => e.q);
}

export function overallStats(bank, state, ruleset) {
  const rs = ruleset || RULESET_CURRENT;
  const eligible = bank.filter((q) => appliesToRuleset(q, rs));
  const answers = state.answers || {};
  let attempted = 0;
  let correct = 0;
  let attemptsTotal = 0;
  let currentlyIncorrect = 0;

  eligible.forEach((q) => {
    const rec = answers[q.id];
    if (!rec || !rec.attempts) return;
    attempted += 1;
    attemptsTotal += rec.attempts;
    correct += rec.correct;
    if (rec.lastResult === 'incorrect') currentlyIncorrect += 1;
  });

  return {
    totalQuestions: eligible.length,
    questionsAttempted: attempted,
    questionsRemaining: eligible.length - attempted,
    totalAttempts: attemptsTotal,
    accuracy: attemptsTotal ? Math.round((correct / attemptsTotal) * 1000) / 10 : 0,
    currentlyIncorrect,
    bookmarks: Array.isArray(state.bookmarks) ? state.bookmarks.length : 0,
    examsTaken: Array.isArray(state.history) ? state.history.length : 0,
    unverified: eligible.filter((q) => q.verified === false).length,
  };
}

export function topicStats(bank, state, ruleset) {
  const rs = ruleset || RULESET_CURRENT;
  const answers = state.answers || {};
  return TOPICS.map((t) => {
    const qs = bank.filter((q) => q.topic === t.key && appliesToRuleset(q, rs));
    let attempts = 0;
    let correct = 0;
    let attempted = 0;
    qs.forEach((q) => {
      const rec = answers[q.id];
      if (!rec || !rec.attempts) return;
      attempted += 1;
      attempts += rec.attempts;
      correct += rec.correct;
    });
    return {
      key: t.key,
      label: t.label,
      total: qs.length,
      attempted,
      attempts,
      correct,
      accuracy: attempts ? Math.round((correct / attempts) * 1000) / 10 : null,
      coverage: qs.length ? Math.round((attempted / qs.length) * 1000) / 10 : 0,
    };
  });
}

/**
 * Weakest topics: lowest accuracy first, counting only topics with enough
 * attempts to be meaningful. Topics never attempted are reported separately
 * so the dashboard can distinguish "weak" from "not started".
 */
export function weakTopics(bank, state, ruleset, options) {
  const opts = options || {};
  const minAttempts = opts.minAttempts == null ? 3 : opts.minAttempts;
  const threshold = opts.threshold == null ? 80 : opts.threshold;
  const limit = opts.limit == null ? 5 : opts.limit;

  const stats = topicStats(bank, state, ruleset);
  const weak = stats
    .filter((t) => t.attempts >= minAttempts && t.accuracy !== null && t.accuracy < threshold)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
  const untouched = stats.filter((t) => t.attempts === 0 && t.total > 0);
  return { weak, untouched };
}

export function weakTopicKeys(bank, state, ruleset, options) {
  const { weak, untouched } = weakTopics(bank, state, ruleset, options);
  const keys = weak.map((t) => t.key);
  if (keys.length) return keys;
  // Nothing measurably weak yet: fall back to topics not yet practised.
  return untouched.map((t) => t.key);
}

export function recentExams(state, limit) {
  const hist = Array.isArray(state.history) ? state.history : [];
  return hist.slice(-(limit || 5)).reverse();
}

// ---------------------------------------------------------------------------
// readiness
// ---------------------------------------------------------------------------

// Deliberately strict thresholds. This is safety education, so the signal has
// to under-claim rather than flatter: "ready" requires broad coverage, high
// accuracy AND a completed full-length mock at or above the benchmark. It is
// never a prediction of the official result, and the UI says so.
export const READINESS = Object.freeze({
  minAttemptedForSignal: 35,   // one full mock's worth before we say anything
  readyCoverage: 60,
  readyAccuracy: 85,
  approachingCoverage: 35,
  approachingAccuracy: 75,
});

/**
 * Summarises how much practice has actually been done and how well it went.
 * Returns a status plus the raw figures behind it, so the UI can always show
 * its working rather than presenting a bare score.
 */
export function readiness(bank, state, ruleset) {
  const overall = overallStats(bank, state, ruleset);
  const history = Array.isArray(state.history) ? state.history : [];
  const mocks = history.filter((h) => h.passApplicable === true);
  const mocksPassed = mocks.filter((h) => h.passed === true).length;

  const coverage = overall.totalQuestions
    ? Math.round((overall.questionsAttempted / overall.totalQuestions) * 1000) / 10
    : 0;
  const accuracy = overall.accuracy;

  const base = {
    attempted: overall.questionsAttempted,
    totalQuestions: overall.totalQuestions,
    coverage,
    accuracy,
    mocksTaken: mocks.length,
    mocksPassed,
    bestMock: mocks.reduce((best, h) => (best === null || h.correct > best ? h.correct : best), null),
  };

  if (overall.questionsAttempted < READINESS.minAttemptedForSignal) {
    return {
      ...base,
      status: 'insufficient',
      label: 'Not enough practice yet',
      detail: `Answer at least ${READINESS.minAttemptedForSignal} questions and we can show how you are tracking. `
        + `You have answered ${overall.questionsAttempted}.`,
    };
  }

  if (coverage >= READINESS.readyCoverage && accuracy >= READINESS.readyAccuracy && mocksPassed > 0) {
    return {
      ...base,
      status: 'ready',
      label: 'Tracking well',
      detail: `You have seen ${coverage}% of the bank at ${accuracy}% accuracy, and passed a full mock. `
        + 'Keep revising the topics you still get wrong.',
    };
  }

  if (coverage >= READINESS.approachingCoverage && accuracy >= READINESS.approachingAccuracy) {
    const missing = mocksPassed === 0 ? ' Sit a full 35-question mock to see where you stand.' : '';
    return {
      ...base,
      status: 'approaching',
      label: 'Getting there',
      detail: `${coverage}% of the bank seen at ${accuracy}% accuracy.${missing}`,
    };
  }

  return {
    ...base,
    status: 'building',
    label: 'More practice needed',
    detail: `${coverage}% of the bank seen at ${accuracy}% accuracy. `
      + 'Work through your weak topics and the questions you have got wrong.',
  };
}

/**
 * Picks the one thing most worth doing next, so the dashboard can lead with a
 * single obvious action instead of a wall of equal choices. Pure, so the
 * decision can be tested directly.
 */
export function suggestedNextStep(input) {
  const o = input || {};
  if (o.hasUnfinishedExam) return 'resume';
  if (!o.attempted) return 'taster';
  if (o.incorrectCount >= 5) return 'review-incorrect';
  if (o.weakCount > 0 && o.attempted >= 20) return 'weak-topics';
  return 'theory-mock';
}

export function topicLabelFor(key) {
  return topicLabel(key);
}
