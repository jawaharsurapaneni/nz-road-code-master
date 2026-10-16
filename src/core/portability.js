// Progress export / import.
//
// Imported JSON is treated as hostile input: it is parsed with JSON.parse
// (never evaluated), every field is type-checked, unknown keys are dropped and
// out-of-range values are rejected. Nothing from the file is ever executed or
// interpolated into the DOM as markup.

import { APP_VERSION } from './schema.js';
import { mergeIntoDefaults, defaultState } from './storage.js';
import { isValidThemePreference } from './theme.js';

export const EXPORT_FORMAT = 'nz-road-code-master-progress';
export const EXPORT_VERSION = 1;

export function exportProgress(state, nowIso) {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_VERSION,
    appVersion: APP_VERSION,
    exportedAt: nowIso || null,
    state: {
      settings: state.settings,
      answers: state.answers,
      bookmarks: state.bookmarks,
      history: state.history,
    },
  };
}

const CONFIDENCE_VALUES = ['low', 'medium', 'high'];

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isFiniteNonNegative(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function sanitiseRecord(raw, errors, qid) {
  if (!isPlainObject(raw)) {
    errors.push(`answers.${qid}: expected an object`);
    return null;
  }
  const attempts = isFiniteNonNegative(raw.attempts) ? Math.floor(raw.attempts) : 0;
  const correct = isFiniteNonNegative(raw.correct) ? Math.floor(raw.correct) : 0;
  const incorrect = isFiniteNonNegative(raw.incorrect) ? Math.floor(raw.incorrect) : 0;
  if (correct + incorrect > attempts) {
    errors.push(`answers.${qid}: correct + incorrect exceeds attempts`);
    return null;
  }
  return {
    attempts,
    correct,
    incorrect,
    lastResult: raw.lastResult === 'correct' || raw.lastResult === 'incorrect' ? raw.lastResult : null,
    lastAnsweredAt: isFiniteNonNegative(raw.lastAnsweredAt) ? raw.lastAnsweredAt : null,
    box: isFiniteNonNegative(raw.box) ? Math.min(Math.floor(raw.box), 4) : 0,
    lastConfidence: CONFIDENCE_VALUES.includes(raw.lastConfidence) ? raw.lastConfidence : null,
  };
}

function sanitiseHistoryEntry(raw, errors, index) {
  if (!isPlainObject(raw)) {
    errors.push(`history[${index}]: expected an object`);
    return null;
  }
  return {
    examId: typeof raw.examId === 'string' ? raw.examId.slice(0, 120) : '',
    mode: typeof raw.mode === 'string' ? raw.mode.slice(0, 60) : 'custom',
    ruleset: typeof raw.ruleset === 'string' ? raw.ruleset.slice(0, 40) : 'current',
    finishedAt: isFiniteNonNegative(raw.finishedAt) ? raw.finishedAt : null,
    total: isFiniteNonNegative(raw.total) ? Math.floor(raw.total) : 0,
    correct: isFiniteNonNegative(raw.correct) ? Math.floor(raw.correct) : 0,
    incorrect: isFiniteNonNegative(raw.incorrect) ? Math.floor(raw.incorrect) : 0,
    unanswered: isFiniteNonNegative(raw.unanswered) ? Math.floor(raw.unanswered) : 0,
    percent: isFiniteNonNegative(raw.percent) ? raw.percent : 0,
    elapsedSeconds: isFiniteNonNegative(raw.elapsedSeconds) ? Math.floor(raw.elapsedSeconds) : 0,
    passApplicable: raw.passApplicable === true,
    passed: raw.passed === true ? true : (raw.passed === false ? false : null),
    incorrectIds: Array.isArray(raw.incorrectIds)
      ? raw.incorrectIds.filter((x) => typeof x === 'string').slice(0, 500)
      : [],
  };
}

/**
 * Validates an already-parsed import payload.
 * Returns { ok, errors, warnings, state }.
 */
export function validateImport(payload, knownQuestionIds) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(payload)) {
    return { ok: false, errors: ['The file does not contain a JSON object.'], warnings, state: null };
  }
  if (payload.format !== EXPORT_FORMAT) {
    return {
      ok: false,
      errors: [`Unrecognised file format. Expected "${EXPORT_FORMAT}".`],
      warnings,
      state: null,
    };
  }
  if (payload.formatVersion !== EXPORT_VERSION) {
    return {
      ok: false,
      errors: [`Unsupported export version ${String(payload.formatVersion)}. This app reads version ${EXPORT_VERSION}.`],
      warnings,
      state: null,
    };
  }
  if (!isPlainObject(payload.state)) {
    return { ok: false, errors: ['The file has no "state" object.'], warnings, state: null };
  }

  const src = payload.state;
  const next = defaultState();
  const known = knownQuestionIds instanceof Set
    ? knownQuestionIds
    : new Set(Array.isArray(knownQuestionIds) ? knownQuestionIds : []);

  if (isPlainObject(src.settings)) {
    if (typeof src.settings.ruleset === 'string') next.settings.ruleset = src.settings.ruleset;
    if (isValidThemePreference(src.settings.theme)) next.settings.theme = src.settings.theme;
    next.settings.confidenceTracking = src.settings.confidenceTracking === true;
  }

  if (isPlainObject(src.answers)) {
    Object.keys(src.answers).forEach((qid) => {
      if (typeof qid !== 'string' || !/^NZRC-\d{3,}$/.test(qid)) {
        warnings.push(`Skipped answer for unrecognised id "${String(qid).slice(0, 40)}".`);
        return;
      }
      if (known.size && !known.has(qid)) {
        warnings.push(`Skipped ${qid}: not in this question bank.`);
        return;
      }
      const rec = sanitiseRecord(src.answers[qid], errors, qid);
      if (rec) next.answers[qid] = rec;
    });
  } else if (src.answers !== undefined) {
    errors.push('"answers" must be an object.');
  }

  if (Array.isArray(src.bookmarks)) {
    next.bookmarks = src.bookmarks
      .filter((x) => typeof x === 'string' && /^NZRC-\d{3,}$/.test(x))
      .filter((x) => !known.size || known.has(x));
    const dropped = src.bookmarks.length - next.bookmarks.length;
    if (dropped > 0) warnings.push(`Skipped ${dropped} bookmark(s) that are not in this question bank.`);
  } else if (src.bookmarks !== undefined) {
    errors.push('"bookmarks" must be an array.');
  }

  if (Array.isArray(src.history)) {
    next.history = src.history
      .slice(0, 200)
      .map((h, i) => sanitiseHistoryEntry(h, errors, i))
      .filter(Boolean);
  } else if (src.history !== undefined) {
    errors.push('"history" must be an array.');
  }

  if (errors.length) return { ok: false, errors, warnings, state: null };
  return { ok: true, errors, warnings, state: mergeIntoDefaults(next) };
}

/**
 * Parses and validates raw text in one step so callers never have to touch
 * JSON.parse (and are never tempted to reach for eval).
 */
export function parseAndValidate(text, knownQuestionIds) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: ['The file is not valid JSON.'], warnings: [], state: null };
  }
  return validateImport(payload, knownQuestionIds);
}
