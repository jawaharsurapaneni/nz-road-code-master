// Persistence adapter. Wraps localStorage but takes the backend as an argument
// so the same code runs under Node tests and degrades to an in-memory store
// when localStorage is unavailable (private browsing, file:// restrictions,
// quota exhausted). The app keeps working for the session either way.

import { isValidThemePreference } from './theme.js';

export const STORAGE_KEY = 'nzrcm.v1.state';

export function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

// Returns the real localStorage if it is usable, otherwise a memory backend.
export function detectBackend(globalObj) {
  const g = globalObj || (typeof globalThis !== 'undefined' ? globalThis : {});
  try {
    const ls = g.localStorage;
    if (!ls) return { backend: createMemoryBackend(), persistent: false, reason: 'localStorage is not available' };
    const probe = '__nzrcm_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return { backend: ls, persistent: true, reason: null };
  } catch (err) {
    return {
      backend: createMemoryBackend(),
      persistent: false,
      reason: `localStorage could not be written to (${err && err.name ? err.name : 'error'})`,
    };
  }
}

export function defaultState() {
  return {
    version: 1,
    settings: {
      ruleset: 'current',
      theme: 'system',
      confidenceTracking: false,
      lastExamConfig: null,
    },
    // questionId -> { attempts, correct, incorrect, lastResult, lastAnsweredAt,
    //                 box, dueAfterAttempts, lastConfidence }
    answers: {},
    bookmarks: [],
    // Completed exam summaries, newest last.
    history: [],
    // An exam that was started and not finished, so a refresh can resume it.
    activeExam: null,
  };
}

export function createStore(backendInfo) {
  const info = backendInfo || detectBackend();
  const backend = info.backend;
  let state = null;
  let warned = false;

  function load() {
    if (state) return state;
    try {
      const raw = backend.getItem(STORAGE_KEY);
      if (!raw) {
        state = defaultState();
        return state;
      }
      const parsed = JSON.parse(raw);
      state = mergeIntoDefaults(parsed);
    } catch (err) {
      // Corrupt or unreadable payload: start clean rather than crash.
      state = defaultState();
    }
    return state;
  }

  function save() {
    if (!state) return false;
    try {
      backend.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      warned = true;
      return false;
    }
  }

  return {
    get persistent() { return info.persistent && !warned; },
    get unavailableReason() { return info.persistent ? null : info.reason; },
    getState: load,
    update(fn) {
      const s = load();
      fn(s);
      save();
      return s;
    },
    replace(next) {
      state = mergeIntoDefaults(next);
      save();
      return state;
    },
    reset() {
      state = defaultState();
      try { backend.removeItem(STORAGE_KEY); } catch (err) { /* nothing to do */ }
      save();
      return state;
    },
  };
}

// Defensive merge: an older or partial payload must not leave required keys
// undefined, and unknown keys are dropped rather than carried forward.
export function mergeIntoDefaults(input) {
  const base = defaultState();
  if (!input || typeof input !== 'object') return base;
  const src = input;
  return {
    version: base.version,
    settings: {
      ruleset: typeof src.settings?.ruleset === 'string' ? src.settings.ruleset : base.settings.ruleset,
      theme: isValidThemePreference(src.settings?.theme) ? src.settings.theme : base.settings.theme,
      confidenceTracking: src.settings?.confidenceTracking === true,
      lastExamConfig: src.settings?.lastExamConfig && typeof src.settings.lastExamConfig === 'object'
        ? src.settings.lastExamConfig
        : null,
    },
    answers: src.answers && typeof src.answers === 'object' && !Array.isArray(src.answers) ? src.answers : {},
    bookmarks: Array.isArray(src.bookmarks) ? src.bookmarks.filter((x) => typeof x === 'string') : [],
    history: Array.isArray(src.history) ? src.history.filter((h) => h && typeof h === 'object') : [],
    activeExam: src.activeExam && typeof src.activeExam === 'object' ? src.activeExam : null,
  };
}
