// Application controller: owns the view state, wires every action the views
// call back into, drives the exam timer, and persists progress.

import {
  el, clear, byId, toast, confirmDialog, downloadJson, readFileAsText,
} from './dom.js';
import {
  NAV_ITEMS, renderNav, renderRulesetBar, renderThemeToggle, renderDashboard, renderSetup, renderExam,
  renderResults, renderBrowse, renderStats, renderRestricted, renderData,
} from './views.js';
import { QUESTIONS, QUESTION_IDS } from '../questions/index.js';
import {
  TOPICS, RULESET_CURRENT, THEORY_MOCK, resolveQuestion, topicLabel,
} from '../core/schema.js';
import { rulesetIds } from '../core/rulesets.js';
import {
  THEME_SYSTEM, isValidThemePreference, resolveTheme, toggledPreference, themeToggleDescriptor,
} from '../core/theme.js';
import { detectBackend, createStore } from '../core/storage.js';
import {
  buildExam, defaultConfig, theoryMockConfig, eligibleQuestions, filterQuestions,
  selectOption, submitAnswer, scoreExam, isCorrect, findQuestion, isExpired,
  remainingSeconds, formatDuration, EXAM_MODES, FEEDBACK_IMMEDIATE, FEEDBACK_END,
} from '../core/exam.js';
import {
  recordAnswer, overallStats, topicStats, weakTopics, weakTopicKeys, recentExams,
  reviewQueue,
} from '../core/stats.js';
import { exportProgress, parseAndValidate } from '../core/portability.js';

const BROWSE_PAGE_SIZE = 15;

const app = {
  store: null,
  state: null,
  view: 'dashboard',
  lastRenderedView: null,
  exam: null,
  result: null,
  draftConfig: defaultConfig({ count: 20 }),
  browse: {
    filters: { search: '', topic: 'all', difficulty: 'mixed', status: 'any', ruleset: RULESET_CURRENT },
    reveal: false,
    limit: BROWSE_PAGE_SIZE,
  },
  timerHandle: null,
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function ruleset() {
  const id = app.state.settings.ruleset;
  return rulesetIds().includes(id) ? id : RULESET_CURRENT;
}

function questionById(qid) {
  return findQuestion(QUESTIONS, qid);
}

function isBookmarkedId(qid) {
  return app.state.bookmarks.indexOf(qid) !== -1;
}

function answerRecordFor(qid) {
  return app.state.answers[qid] || null;
}

function countFor(mode, extra) {
  const cfg = defaultConfig({ mode, ruleset: ruleset(), count: 'all', ...(extra || {}) });
  return eligibleQuestions(QUESTIONS, cfg, app.state, weakTopicKeys(QUESTIONS, app.state, ruleset())).length;
}

function dashboardCounts() {
  return {
    all: filterQuestions(QUESTIONS, { ruleset: ruleset() }, app.state).length,
    incorrect: countFor(EXAM_MODES.REVIEW_INCORRECT),
    bookmarked: countFor(EXAM_MODES.REVIEW_BOOKMARKS),
    signs: countFor(EXAM_MODES.SIGNS),
    hazard: countFor(EXAM_MODES.HAZARD),
    restricted: countFor(EXAM_MODES.RESTRICTED),
    weak: countFor(EXAM_MODES.WEAK_TOPICS),
  };
}

function topicCounts() {
  const out = {};
  TOPICS.forEach((t) => {
    out[t.key] = filterQuestions(QUESTIONS, { ruleset: ruleset(), topic: t.key }, app.state).length;
  });
  return out;
}

function persist(fn) {
  app.store.update(fn);
  app.state = app.store.getState();
}

// --------------------------------------------------------------------- theme

// Cached so a failure to match the media query (older browsers, odd embeds)
// degrades to the light theme rather than throwing on every render.
function systemPrefersDark() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (err) {
    return false;
  }
}

function themePreference() {
  const stored = app.state.settings.theme;
  return isValidThemePreference(stored) ? stored : THEME_SYSTEM;
}

function applyTheme() {
  const resolved = resolveTheme(themePreference(), systemPrefersDark());
  document.documentElement.setAttribute('data-theme', resolved);
  return resolved;
}

function watchSystemTheme() {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      // Only repaint when the user is actually following the system.
      if (themePreference() !== THEME_SYSTEM) return;
      applyTheme();
      render();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (err) {
    /* no media query support: the stored preference still works */
  }
}

function examInProgress() {
  return !!(app.exam && !app.exam.completed && app.view === 'exam');
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

const actions = {
  go(view) {
    if (examInProgress() && view !== 'exam') {
      actions.exitExam(view);
      return;
    }
    app.view = view;
    render();
  },

  // --- exam lifecycle ------------------------------------------------------

  startExam(config) {
    const cfg = defaultConfig({ ruleset: ruleset(), ...config });
    const exam = buildExam(QUESTIONS, cfg, app.state, {
      now: Date.now(),
      weakTopicKeys: weakTopicKeys(QUESTIONS, app.state, ruleset()),
    });
    if (!exam.items.length) {
      toast('No questions match those settings.', 'warn');
      app.view = 'setup';
      render();
      return;
    }
    if (exam.truncated) {
      toast(`Only ${exam.available} question${exam.available === 1 ? '' : 's'} matched, so this exam has ${exam.items.length}.`, 'warn');
    }
    app.exam = exam;
    app.result = null;
    app.view = 'exam';
    persist((s) => { s.activeExam = exam; s.settings.lastExamConfig = cfg; });
    render();
  },

  startTheoryMock() {
    actions.startExam(theoryMockConfig({ ruleset: ruleset() }));
  },

  startMode(mode, extra) {
    const available = countFor(mode, extra);
    actions.startExam({
      mode,
      count: (extra && extra.count !== undefined) ? extra.count : Math.min(20, available),
      feedback: FEEDBACK_IMMEDIATE,
      timed: false,
      ...(extra || {}),
    });
  },

  // Lets a first-time visitor answer a real question immediately, with no
  // configuration screen in the way. Five questions, feedback as you go.
  startTaster() {
    actions.startExam({
      mode: EXAM_MODES.CUSTOM,
      count: 5,
      feedback: FEEDBACK_IMMEDIATE,
      timed: false,
      selection: 'unanswered',
    });
  },

  startDraft() {
    actions.startExam(app.draftConfig);
  },

  updateDraft(patch) {
    app.draftConfig = defaultConfig({ ...app.draftConfig, ...patch });
    render();
  },

  resumeExam() {
    const saved = app.state.activeExam;
    if (!saved || !saved.items || !saved.items.length) {
      toast('That exam could no longer be restored.', 'warn');
      persist((s) => { s.activeExam = null; });
      render();
      return;
    }
    // Drop any question that is no longer in the bank (e.g. after an update).
    saved.items = saved.items.filter((i) => !!questionById(i.qid));
    if (!saved.items.length) {
      persist((s) => { s.activeExam = null; });
      toast('That exam could no longer be restored.', 'warn');
      render();
      return;
    }
    if (saved.cursor >= saved.items.length) saved.cursor = saved.items.length - 1;
    app.exam = saved;
    app.view = 'exam';
    render();
  },

  discardExam() {
    persist((s) => { s.activeExam = null; });
    app.exam = null;
    render();
  },

  selectOption(optionId) {
    if (!app.exam) return;
    selectOption(app.exam, app.exam.cursor, optionId);
    persistActiveExam();
    render();
  },

  submitAnswer() {
    const exam = app.exam;
    if (!exam) return;
    const item = exam.items[exam.cursor];
    if (!item || item.submitted || !item.selectedOptionId) return;
    submitAnswer(exam, exam.cursor, Date.now());
    if (exam.config.feedback === FEEDBACK_IMMEDIATE) recordItem(item);
    persistActiveExam();
    render();
  },

  setConfidence(level) {
    const exam = app.exam;
    if (!exam) return;
    const item = exam.items[exam.cursor];
    if (!item || !item.submitted) return;
    item.confidence = level;
    persist((s) => {
      const rec = s.answers[item.qid];
      if (rec) {
        rec.lastConfidence = level;
        if (rec.lastResult === 'correct' && level === 'low') rec.box = Math.min(rec.box, 1);
      }
      s.activeExam = exam;
    });
    render();
  },

  next() {
    if (!app.exam) return;
    if (app.exam.cursor < app.exam.items.length - 1) {
      app.exam.cursor += 1;
      persistActiveExam();
      render();
      window.scrollTo(0, 0);
    }
  },

  prev() {
    if (!app.exam) return;
    if (app.exam.cursor > 0) {
      app.exam.cursor -= 1;
      persistActiveExam();
      render();
      window.scrollTo(0, 0);
    }
  },

  goToQuestion(index) {
    if (!app.exam) return;
    if (index >= 0 && index < app.exam.items.length) {
      app.exam.cursor = index;
      persistActiveExam();
      render();
      window.scrollTo(0, 0);
    }
  },

  finishExam(reason) {
    const exam = app.exam;
    if (!exam || exam.completed) return;
    const unanswered = exam.items.filter((i) => !i.selectedOptionId).length;

    const complete = () => {
      exam.completed = true;
      exam.finishedAt = Date.now();
      // End-of-exam mode records every answer only now; immediate mode has
      // already recorded each one as it was submitted.
      exam.items.forEach((item) => { if (item.selectedOptionId) recordItem(item); });
      const result = scoreExam(QUESTIONS, exam, exam.finishedAt);
      app.result = result;
      persist((s) => {
        s.history.push({
          examId: exam.id,
          mode: exam.config.mode,
          ruleset: exam.config.ruleset,
          finishedAt: exam.finishedAt,
          total: result.total,
          correct: result.correct,
          incorrect: result.incorrect,
          unanswered: result.unanswered,
          percent: result.percent,
          elapsedSeconds: result.elapsedSeconds,
          passApplicable: result.passApplicable,
          passed: result.passed,
          incorrectIds: result.incorrectIds,
        });
        if (s.history.length > 200) s.history = s.history.slice(-200);
        s.activeExam = null;
      });
      stopTimer();
      app.view = 'results';
      render();
      window.scrollTo(0, 0);
    };

    if (reason === 'time') {
      toast('Time is up. The exam has been submitted.', 'warn');
      complete();
      return;
    }
    if (unanswered > 0) {
      confirmDialog({
        title: 'Submit with unanswered questions?',
        body: [
          `${unanswered} question${unanswered === 1 ? ' has' : 's have'} no answer. Blank answers are marked as incorrect.`,
          'You can go back and finish them first.',
        ],
        confirmLabel: 'Submit anyway',
        cancelLabel: 'Go back',
      }).then((ok) => { if (ok) complete(); });
      return;
    }
    complete();
  },

  exitExam(targetView) {
    const exam = app.exam;
    if (!exam) { app.view = targetView || 'dashboard'; render(); return; }
    confirmDialog({
      title: 'Exit this exam?',
      body: [
        'The exam will be abandoned. It will not be scored, will not appear in your history, and will not '
        + 'show a pass or fail result.',
        exam.config.feedback === FEEDBACK_IMMEDIATE
          ? 'Answers you have already submitted stay in your progress and topic statistics.'
          : 'Nothing from this exam will be recorded, because you have not submitted it.',
      ],
      confirmLabel: 'Exit exam',
      cancelLabel: 'Keep going',
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      exam.abandoned = true;
      stopTimer();
      app.exam = null;
      app.result = null;
      persist((s) => { s.activeExam = null; });
      app.view = targetView || 'dashboard';
      render();
    });
  },

  retryIncorrect(ids) {
    if (!ids || !ids.length) return;
    actions.startExam({
      mode: EXAM_MODES.REVIEW_INCORRECT,
      ids,
      count: ids.length,
      feedback: FEEDBACK_IMMEDIATE,
      timed: false,
    });
  },

  retake() {
    if (!app.exam) return;
    actions.startExam({ ...app.exam.config, seed: null });
  },

  practiseFiltered(ids) {
    actions.startExam({
      mode: EXAM_MODES.CUSTOM,
      ids,
      count: Math.min(ids.length, 50),
      feedback: FEEDBACK_IMMEDIATE,
      timed: false,
    });
  },

  practiseDue() {
    const due = reviewQueue(QUESTIONS, app.state, Date.now(), ruleset()).slice(0, 20);
    if (!due.length) { toast('Nothing is due for review.', 'warn'); return; }
    actions.startExam({
      mode: EXAM_MODES.CUSTOM,
      ids: due.map((q) => q.id),
      count: due.length,
      feedback: FEEDBACK_IMMEDIATE,
      timed: false,
    });
  },

  // --- study data ----------------------------------------------------------

  toggleBookmark(qid) {
    persist((s) => {
      const i = s.bookmarks.indexOf(qid);
      if (i === -1) s.bookmarks.push(qid); else s.bookmarks.splice(i, 1);
    });
    toast(isBookmarkedId(qid) ? 'Bookmarked.' : 'Bookmark removed.');
    render();
  },

  setRuleset(id) {
    persist((s) => { s.settings.ruleset = id; });
    app.browse.filters.ruleset = id;
    app.draftConfig = defaultConfig({ ...app.draftConfig, ruleset: id });
    toast('Ruleset changed. Questions will be marked against the new rules.');
    render();
  },

  setTheme(preference) {
    if (!isValidThemePreference(preference)) return;
    persist((s) => { s.settings.theme = preference; });
    applyTheme();
    render();
  },

  toggleTheme() {
    actions.setTheme(toggledPreference(themePreference(), systemPrefersDark()));
  },
  setConfidenceTracking(on) {
    persist((s) => { s.settings.confidenceTracking = !!on; });
    render();
  },

  updateBrowse(patch) {
    app.browse.filters = { ...app.browse.filters, ...patch };
    app.browse.limit = BROWSE_PAGE_SIZE;
    render();
  },

  resetBrowse() {
    app.browse.filters = { search: '', topic: 'all', difficulty: 'mixed', status: 'any', ruleset: ruleset() };
    app.browse.limit = BROWSE_PAGE_SIZE;
    render();
  },

  toggleBrowseReveal() {
    app.browse.reveal = !app.browse.reveal;
    render();
  },

  showMoreBrowse() {
    app.browse.limit += BROWSE_PAGE_SIZE * 2;
    render();
  },

  exportProgress() {
    const payload = exportProgress(app.state, new Date().toISOString());
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`nz-road-code-master-progress-${stamp}.json`, payload);
    toast('Progress exported.');
  },

  importProgress(file) {
    readFileAsText(file).then((text) => {
      const result = parseAndValidate(text, QUESTION_IDS);
      if (!result.ok) {
        toast(`Import failed: ${result.errors[0]}`, 'error');
        return;
      }
      confirmDialog({
        title: 'Replace your current progress?',
        body: [
          'Importing will overwrite the answers, bookmarks and exam history stored on this device.',
          result.warnings.length ? `${result.warnings.length} item(s) in the file were skipped: ${result.warnings[0]}` : null,
        ].filter(Boolean),
        confirmLabel: 'Import and replace',
        danger: true,
      }).then((ok) => {
        if (!ok) return;
        app.state = app.store.replace(result.state);
        app.exam = null;
        app.result = null;
        app.view = 'dashboard';
        toast('Progress imported.');
        render();
      });
    }).catch((err) => toast(err.message || 'The file could not be read.', 'error'));
  },

  resetProgress() {
    confirmDialog({
      title: 'Reset all progress?',
      body: [
        'This clears every answer, bookmark, exam result and setting stored in this browser.',
        'It cannot be undone. Export your progress first if you want a backup.',
      ],
      confirmLabel: 'Reset everything',
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      app.state = app.store.reset();
      app.exam = null;
      app.result = null;
      app.view = 'dashboard';
      toast('All progress has been reset.');
      render();
    });
  },
};

// ---------------------------------------------------------------------------
// answer recording
// ---------------------------------------------------------------------------

function recordItem(item) {
  if (item.recorded) return;
  const exam = app.exam;
  const correct = isCorrect(QUESTIONS, exam, item);
  item.recorded = true;
  persist((s) => {
    recordAnswer(s, item.qid, correct, Date.now(), item.confidence);
  });
}

function persistActiveExam() {
  if (!app.exam || app.exam.completed) return;
  persist((s) => { s.activeExam = app.exam; });
}

// ---------------------------------------------------------------------------
// timer
// ---------------------------------------------------------------------------

function startTimer() {
  stopTimer();
  if (!app.exam || !app.exam.timeLimitSeconds) return;
  app.timerHandle = window.setInterval(() => {
    if (!app.exam || app.exam.completed) { stopTimer(); return; }
    const left = remainingSeconds(app.exam, Date.now());
    const node = document.querySelector('.timer');
    if (node) {
      node.textContent = formatDuration(left);
      node.setAttribute('aria-label', `Time remaining ${formatDuration(left)}`);
      if (left <= 120) node.classList.add('is-low');
    }
    if (isExpired(app.exam, Date.now())) {
      stopTimer();
      actions.finishExam('time');
    }
  }, 1000);
}

function stopTimer() {
  if (app.timerHandle !== null) {
    window.clearInterval(app.timerHandle);
    app.timerHandle = null;
  }
}

// ---------------------------------------------------------------------------
// keyboard
// ---------------------------------------------------------------------------

function onKeyDown(e) {
  if (app.view !== 'exam' || !app.exam) return;
  const tag = (e.target && e.target.tagName) || '';
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.getElementById('dialog-root').firstChild) return;

  const exam = app.exam;
  const item = exam.items[exam.cursor];
  if (!item) return;
  const immediate = exam.config.feedback === FEEDBACK_IMMEDIATE;
  const revealed = immediate && item.submitted;

  const key = e.key.toLowerCase();
  const letterIndex = ['a', 'b', 'c', 'd'].indexOf(key);
  const numberIndex = ['1', '2', '3', '4'].indexOf(key);
  const index = letterIndex !== -1 ? letterIndex : numberIndex;

  if (index !== -1 && !revealed) {
    e.preventDefault();
    const optionId = item.order[index];
    if (optionId) actions.selectOption(optionId);
    return;
  }
  if (key === 'b') { e.preventDefault(); actions.toggleBookmark(item.qid); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); actions.next(); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); actions.prev(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (immediate) {
      if (!item.submitted) actions.submitAnswer();
      else if (exam.cursor === exam.items.length - 1) actions.finishExam();
      else actions.next();
    } else if (exam.cursor === exam.items.length - 1) {
      actions.finishExam();
    } else {
      actions.next();
    }
  }
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function browseResults() {
  const f = app.browse.filters;
  const criteria = {
    ruleset: f.ruleset,
    topic: f.topic,
    difficulty: f.difficulty,
    search: f.search,
  };
  if (f.status === 'unanswered') criteria.selection = 'unanswered';
  if (f.status === 'bookmarked') criteria.bookmarkedOnly = true;
  if (f.status === 'incorrect') criteria.answeredState = 'incorrect';
  if (f.status === 'correct') criteria.answeredState = 'correct';
  return filterQuestions(QUESTIONS, criteria, app.state);
}

function buildContext() {
  const rs = ruleset();
  return {
    actions,
    bank: QUESTIONS,
    ruleset: rs,
    now: Date.now(),
    state: app.state,
    persistent: app.store.persistent,
    persistentReason: app.store.unavailableReason || 'storage is unavailable',
    confidenceTracking: app.state.settings.confidenceTracking === true,
    themePreference: themePreference(),
    themeToggle: themeToggleDescriptor(themePreference(), systemPrefersDark()),
    overall: overallStats(QUESTIONS, app.state, rs),
    topics: topicStats(QUESTIONS, app.state, rs),
    weak: weakTopics(QUESTIONS, app.state, rs),
    recent: recentExams(app.state, 5),
    history: recentExams(app.state, 50),
    counts: dashboardCounts(),
    readiness: readiness(QUESTIONS, app.state, rs),
    nextStep: suggestedNextStep({
      hasUnfinishedExam: !!(app.state.activeExam && !app.exam),
      attempted: overallStats(QUESTIONS, app.state, rs).questionsAttempted,
      incorrectCount: countFor(EXAM_MODES.REVIEW_INCORRECT),
      weakCount: weakTopics(QUESTIONS, app.state, rs).weak.length,
    }),
    topicCounts: topicCounts(),
    dueCount: reviewQueue(QUESTIONS, app.state, Date.now(), rs).length,
    questionById,
    isBookmarked: isBookmarkedId,
    answerRecord: answerRecordFor,
    exam: app.exam,
    result: app.result,
    draftConfig: app.draftConfig,
    draftAvailable: eligibleQuestions(
      QUESTIONS,
      defaultConfig({ ...app.draftConfig, ruleset: app.draftConfig.ruleset || rs }),
      app.state,
      weakTopicKeys(QUESTIONS, app.state, rs),
    ).length,
    resumable: app.state.activeExam && !app.exam
      ? {
        total: app.state.activeExam.items ? app.state.activeExam.items.length : 0,
        answered: app.state.activeExam.items
          ? app.state.activeExam.items.filter((i) => i.selectedOptionId).length : 0,
      }
      : null,
    browseFilters: app.browse.filters,
    browseReveal: app.browse.reveal,
    browseResults: [],
    browsePage: [],
  };
}

function render() {
  const root = byId('view-root');
  const ctx = buildContext();

  if (app.view === 'browse') {
    ctx.browseResults = browseResults();
    ctx.browsePage = ctx.browseResults.slice(0, app.browse.limit);
  }

  clear(byId('app-nav'));
  byId('app-nav').appendChild(renderNav(app.view, actions));

  clear(byId('theme-toggle-slot'));
  byId('theme-toggle-slot').appendChild(renderThemeToggle(ctx));

  clear(byId('ruleset-bar'));
  byId('ruleset-bar').appendChild(renderRulesetBar(ctx));

  clear(root);
  let node;
  try {
    switch (app.view) {
      case 'setup': node = renderSetup(ctx); break;
      case 'exam': node = app.exam ? renderExam(ctx) : renderDashboard(ctx); break;
      case 'results': node = app.result ? renderResults(ctx) : renderDashboard(ctx); break;
      case 'browse': node = renderBrowse(ctx); break;
      case 'stats': node = renderStats(ctx); break;
      case 'restricted': node = renderRestricted(ctx); break;
      case 'data': node = renderData(ctx); break;
      default: node = renderDashboard(ctx); break;
    }
  } catch (err) {
    node = el('div', { class: 'callout callout-danger' }, [
      el('p', {}, [el('strong', { text: 'Something went wrong rendering this screen. ' }), 'Your progress is safe.']),
      el('p', { class: 'muted', text: String(err && err.message ? err.message : err) }),
      el('button', { class: 'btn', type: 'button', text: 'Back to dashboard', onClick: () => actions.go('dashboard') }),
    ]);
  }
  root.appendChild(node);

  if (app.view !== app.lastRenderedView) {
    app.lastRenderedView = app.view;
    byId('main').focus();
    if (app.view !== 'exam') window.scrollTo(0, 0);
  }

  if (app.view === 'exam' && app.exam && app.exam.timeLimitSeconds && app.timerHandle === null) startTimer();
  if (app.view !== 'exam') stopTimer();
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

function boot() {
  const backendInfo = detectBackend(window);
  app.store = createStore(backendInfo);
  app.state = app.store.getState();

  if (!rulesetIds().includes(app.state.settings.ruleset)) {
    persist((s) => { s.settings.ruleset = RULESET_CURRENT; });
  }
  app.browse.filters.ruleset = ruleset();
  app.draftConfig = defaultConfig({
    ...(app.state.settings.lastExamConfig || {}),
    ruleset: ruleset(),
    seed: null,
    ids: null,
  });

  applyTheme();
  watchSystemTheme();

  document.addEventListener('keydown', onKeyDown);

  // Warn before a refresh or tab close abandons an exam in progress.
  window.addEventListener('beforeunload', (e) => {
    if (!examInProgress()) return undefined;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  if (!QUESTIONS.length) {
    clear(byId('view-root')).appendChild(el('div', { class: 'callout callout-danger' }, [
      el('p', { text: 'The question bank is empty. This build is incomplete.' }),
    ]));
    return;
  }

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
