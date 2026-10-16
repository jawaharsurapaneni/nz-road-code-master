// View rendering. Each function returns DOM nodes and calls back into the
// `actions` object supplied by ui/app.js; no view reaches into application
// state directly, and nothing here uses innerHTML.

import {
  el, frag, insertTrustedSvg, formatPercent, formatDateTime,
} from './dom.js';
import { diagramFor } from './svg.js';
import {
  TOPICS, topicLabel, DIFFICULTIES, THEORY_MOCK, resolveQuestion, RULESET_CURRENT,
  RULESET_2027, APP_NAME, APP_SUBTITLE,
} from '../core/schema.js';
import { RULESETS, CHANGES_2027, BANK_LAST_VERIFIED, rulesetById } from '../core/rulesets.js';
import { THEME_PREFERENCES, themePreferenceLabel } from '../core/theme.js';
import {
  EXAM_MODES, FEEDBACK_IMMEDIATE, FEEDBACK_END, formatDuration, remainingSeconds,
  DIFFICULTY_LABELS,
} from '../core/exam.js';

export const NAV_ITEMS = [
  { view: 'dashboard', label: 'Dashboard' },
  { view: 'setup', label: 'Practise' },
  { view: 'browse', label: 'Browse questions' },
  { view: 'restricted', label: 'Restricted prep' },
  { view: 'stats', label: 'Statistics' },
  { view: 'data', label: 'Progress data' },
];

const DISPLAY_LETTERS = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------------------
// chrome
// ---------------------------------------------------------------------------

export function renderNav(current, actions) {
  return frag(NAV_ITEMS.map((item) => el('button', {
    type: 'button',
    text: item.label,
    'aria-current': current === item.view ? 'page' : null,
    onClick: () => actions.go(item.view),
  })));
}

/**
 * The header theme switch. It is labelled with the action it performs rather
 * than the state it is in, which is what a screen reader needs to hear.
 */
export function renderThemeToggle(ctx) {
  const t = ctx.themeToggle;
  return el('button', {
    class: 'theme-toggle',
    type: 'button',
    'aria-label': t.ariaLabel,
    title: t.ariaLabel,
    onClick: () => ctx.actions.toggleTheme(),
  }, [
    el('span', { class: 'glyph', 'aria-hidden': 'true', text: t.glyph }),
    el('span', { text: t.label }),
  ]);
}

export function renderRulesetBar(ctx) {
  const rs = rulesetById(ctx.ruleset);
  const unverified = ctx.bank.filter((q) => q.verified === false).length;
  return el('div', { class: 'shell' }, [
    // The app follows the NZTA website colour theme, so it states plainly that
    // it is not an NZTA service right where the themed chrome would otherwise
    // imply one.
    el('span', {
      class: 'pill pill-independent',
      title: 'This app is not produced or endorsed by NZTA Waka Kotahi.',
      text: 'Independent study tool — not an official NZTA service',
    }),
    el('span', {}, [el('strong', { text: 'Ruleset: ' }), `${rs.label} (${rs.effectiveFrom})`]),
    el('span', { class: 'pill', text: `${ctx.bank.length} questions` }),
    el('span', { class: 'pill', text: `Bank verified ${BANK_LAST_VERIFIED}` }),
    unverified > 0
      ? el('span', { class: 'pill pill-unverified', text: `${unverified} awaiting verification` })
      : el('span', { class: 'pill', text: 'All questions source-referenced' }),
    el('button', {
      class: 'btn btn-ghost btn-small', type: 'button', text: 'Change ruleset',
      onClick: () => ctx.actions.go('data'),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------

function statTile(value, label) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'value', text: String(value) }),
    el('div', { class: 'label', text: label }),
  ]);
}

function actionTile(opts) {
  return el('button', {
    class: `action-tile${opts.primary ? ' is-primary' : ''}`,
    type: 'button',
    disabled: opts.disabled || false,
    onClick: opts.onClick,
  }, [
    el('span', { class: 'title', text: opts.title }),
    el('span', { class: 'desc', text: opts.desc }),
    el('span', { class: 'count', text: opts.count }),
  ]);
}

export function renderDashboard(ctx) {
  const a = ctx.actions;
  const s = ctx.overall;
  const nodes = [];

  nodes.push(el('h1', { text: `${APP_NAME} — ${APP_SUBTITLE}` }));
  nodes.push(el('p', { class: 'lede' }, [
    'Practise for the New Zealand learner licence theory test and prepare for driving solo on a restricted '
    + 'licence. Everything runs on this device: no account, no network, no tracking.',
  ]));

  // An unfinished exam is surfaced as the primary action below, not as a
  // separate banner, so there is only ever one thing asking to be done first.

  if (!ctx.persistent) {
    nodes.push(el('div', { class: 'callout callout-warn' }, [
      el('p', { text: `Progress cannot be saved in this browser (${ctx.persistentReason}). The app still works — your results will simply be lost when you close the tab.` }),
    ]));
  }

  // --- one primary action -------------------------------------------------
  // Rather than present eleven equal choices, lead with the single thing most
  // worth doing, chosen from what the learner has actually done so far.
  nodes.push(renderNextStep(ctx));

  // --- how it is going ----------------------------------------------------
  nodes.push(renderReadiness(ctx));

  // --- everything else, grouped and demoted -------------------------------
  nodes.push(el('section', { class: 'card' }, [
    el('h2', { text: 'Practise' }),
    el('div', { class: 'grid grid-actions' }, [
      actionTile({
        title: `${THEORY_MOCK.questionCount}-question mock exam`,
        desc: `Full length, ${THEORY_MOCK.timeLimitSeconds / 60} minute timer, feedback at the end.`,
        count: `Benchmark ${THEORY_MOCK.passMark}/${THEORY_MOCK.questionCount} · practice only`,
        onClick: () => a.startTheoryMock(),
      }),
      // With no attempts yet there is nothing measurably weak, so this mode
      // falls back to topics not started. Say that, rather than implying the
      // whole bank is a weakness.
      actionTile({
        title: ctx.weak.weak.length ? 'Weak topics' : 'Topics you have not started',
        desc: ctx.weak.weak.length
          ? 'Drawn only from the topics you score lowest in.'
          : 'Once you have answered more, this narrows to your lowest-scoring topics.',
        count: ctx.counts.weak ? `${ctx.counts.weak} questions` : 'Nothing to draw on yet',
        disabled: !ctx.counts.weak,
        onClick: () => a.startMode(EXAM_MODES.WEAK_TOPICS),
      }),
      actionTile({
        title: 'Questions you got wrong',
        desc: 'Re-sit them, most-missed first.',
        count: ctx.counts.incorrect ? `${ctx.counts.incorrect} to review` : 'Nothing wrong yet',
        disabled: !ctx.counts.incorrect,
        onClick: () => a.startMode(EXAM_MODES.REVIEW_INCORRECT),
      }),
      actionTile({
        title: 'Road signs',
        desc: 'Signs, signals and traffic lights only.',
        count: `${ctx.counts.signs} questions`,
        disabled: !ctx.counts.signs,
        onClick: () => a.startMode(EXAM_MODES.SIGNS),
      }),
      actionTile({
        title: 'Hazard scenarios',
        desc: 'Hazard spotting, defensive driving and scanning.',
        count: `${ctx.counts.hazard} questions`,
        disabled: !ctx.counts.hazard,
        onClick: () => a.startMode(EXAM_MODES.HAZARD),
      }),
      actionTile({
        title: 'Restricted practical prep',
        desc: 'Decision-making scenarios and licence conditions.',
        count: `${ctx.counts.restricted} questions`,
        disabled: !ctx.counts.restricted,
        onClick: () => a.go('restricted'),
      }),
      actionTile({
        title: 'Bookmarks',
        desc: 'The questions you flagged to come back to.',
        count: ctx.counts.bookmarked ? `${ctx.counts.bookmarked} bookmarked` : 'No bookmarks yet',
        disabled: !ctx.counts.bookmarked,
        onClick: () => a.startMode(EXAM_MODES.REVIEW_BOOKMARKS),
      }),
      actionTile({
        title: 'Build your own',
        desc: 'Choose count, topic, difficulty, feedback style and timer.',
        count: `${ctx.counts.all} questions eligible`,
        onClick: () => a.go('setup'),
      }),
    ]),
  ]));

  // Weak topics, shown only once there is something real to say.
  if (ctx.weak.weak.length) {
    nodes.push(el('section', { class: 'card' }, [
      el('h2', { text: 'Where to focus' }),
      el('p', { class: 'muted', text: 'Your lowest-scoring topics so far.' }),
      topicTable(ctx.weak.weak),
    ]));
  }

  if (ctx.recent.length) {
    nodes.push(el('section', { class: 'card' }, [
      el('h2', { text: 'Recent results' }),
      historyTable(ctx.recent),
    ]));
  }

  // Housekeeping, deliberately last and quiet.
  nodes.push(el('section', { class: 'card card-tight' }, [
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Browse all questions', onClick: () => a.go('browse') }),
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Statistics and history', onClick: () => a.go('stats') }),
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Progress data and settings', onClick: () => a.go('data') }),
    ]),
  ]));

  return frag(nodes);
}

/**
 * The hero action. One obvious next step, with its reason stated, plus a quiet
 * alternative so the choice is never a dead end.
 */
function renderNextStep(ctx) {
  const a = ctx.actions;
  const steps = {
    resume: {
      eyebrow: 'Pick up where you left off',
      title: 'Resume your exam',
      why: ctx.resumable
        ? `${ctx.resumable.answered} of ${ctx.resumable.total} questions answered.`
        : 'You have an exam in progress.',
      cta: 'Resume exam',
      run: () => a.resumeExam(),
      alt: { label: 'Discard it and start fresh', run: () => a.discardExam() },
    },
    taster: {
      eyebrow: 'Start here',
      title: 'Try five questions',
      why: 'No setup, no account. Real questions with the rule explained after each answer.',
      cta: 'Answer a question now',
      run: () => a.startTaster(),
      alt: { label: 'Or browse all 275 questions first', run: () => a.go('browse') },
    },
    'review-incorrect': {
      eyebrow: 'Recommended next',
      title: 'Fix what you got wrong',
      why: `${ctx.counts.incorrect} questions are still wrong. These are worth more than new ones.`,
      cta: 'Review them now',
      run: () => a.startMode(EXAM_MODES.REVIEW_INCORRECT),
      alt: { label: 'Or sit a full mock exam', run: () => a.startTheoryMock() },
    },
    'weak-topics': {
      eyebrow: 'Recommended next',
      title: 'Work on your weakest topics',
      why: ctx.weak.weak.length
        ? `Lowest so far: ${ctx.weak.weak.slice(0, 2).map((t) => t.label).join(' and ')}.`
        : 'Targeted practice on the topics you score lowest in.',
      cta: 'Practise weak topics',
      run: () => a.startMode(EXAM_MODES.WEAK_TOPICS),
      alt: { label: 'Or sit a full mock exam', run: () => a.startTheoryMock() },
    },
    'theory-mock': {
      eyebrow: 'Recommended next',
      title: `Sit the ${THEORY_MOCK.questionCount}-question mock`,
      why: `Full length and timed, scored against the ${THEORY_MOCK.passMark}/${THEORY_MOCK.questionCount} benchmark. Practice only.`,
      cta: 'Start the mock exam',
      run: () => a.startTheoryMock(),
      alt: { label: 'Or choose your own settings', run: () => a.go('setup') },
    },
  };
  const step = steps[ctx.nextStep] || steps['theory-mock'];

  return el('section', { class: 'next-step' }, [
    el('p', { class: 'next-step-eyebrow', text: step.eyebrow }),
    el('h2', { class: 'next-step-title', text: step.title }),
    el('p', { class: 'next-step-why', text: step.why }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn-primary', type: 'button', text: step.cta, onClick: step.run }),
    ]),
    step.alt
      ? el('button', { class: 'btn btn-ghost btn-small next-step-alt', type: 'button', text: step.alt.label, onClick: step.alt.run })
      : null,
  ]);
}

/**
 * An honest progress signal. It always shows the figures it is derived from,
 * and never claims to predict the official result.
 */
function renderReadiness(ctx) {
  const r = ctx.readiness;
  const s = ctx.overall;
  return el('section', { class: 'card' }, [
    el('h2', { text: 'How you are tracking' }),
    el('p', { class: `readiness-status is-${r.status}` }, [
      el('strong', { text: r.label }),
    ]),
    el('p', { class: 'muted', text: r.detail }),
    el('div', { class: 'grid grid-stats' }, [
      statTile(`${s.questionsAttempted}/${s.totalQuestions}`, 'Questions seen'),
      statTile(formatPercent(s.accuracy), 'Accuracy'),
      statTile(s.currentlyIncorrect, 'Still wrong'),
      statTile(r.mocksTaken ? `${r.bestMock}/${THEORY_MOCK.questionCount}` : '—', 'Best mock'),
    ]),
    el('p', { class: 'muted', text: 'This reflects your practice in this app only. It is not a prediction of the official test result.' }),
  ]);
}

function topicTable(rows) {
  return el('div', { class: 'table-wrap' }, el('table', {}, [
    el('thead', {}, el('tr', {}, [
      el('th', { text: 'Topic' }),
      el('th', { class: 'num', text: 'Answered' }),
      el('th', { class: 'num', text: 'Accuracy' }),
      el('th', { text: '' }),
    ])),
    el('tbody', {}, rows.map((t) => {
      const acc = t.accuracy === null ? 0 : t.accuracy;
      const cls = acc < 50 ? 'bar low' : (acc < 80 ? 'bar mid' : 'bar');
      return el('tr', {}, [
        el('td', { text: t.label }),
        el('td', { class: 'num', text: String(t.attempts || 0) }),
        el('td', { class: 'num', text: t.accuracy === null ? '-' : formatPercent(t.accuracy) }),
        el('td', {}, el('div', { class: cls }, el('span', { style: `width:${acc}%` }))),
      ]);
    })),
  ]));
}

function historyTable(rows) {
  return el('div', { class: 'table-wrap' }, el('table', {}, [
    el('thead', {}, el('tr', {}, [
      el('th', { text: 'When' }),
      el('th', { text: 'Exam' }),
      el('th', { class: 'num', text: 'Score' }),
      el('th', { class: 'num', text: 'Time' }),
      el('th', { text: 'Result' }),
    ])),
    el('tbody', {}, rows.map((h) => el('tr', {}, [
      el('td', { text: formatDateTime(h.finishedAt) }),
      el('td', { text: examModeLabel(h.mode) }),
      el('td', { class: 'num', text: `${h.correct}/${h.total}` }),
      el('td', { class: 'num', text: formatDuration(h.elapsedSeconds) }),
      el('td', {}, h.passApplicable
        ? el('span', { class: `pill ${h.passed ? 'pill-beginner' : 'pill-advanced'}`, text: h.passed ? 'At or above benchmark' : 'Below benchmark' })
        : el('span', { class: 'muted', text: formatPercent(h.percent) })),
    ]))),
  ]));
}

export function examModeLabel(mode) {
  switch (mode) {
    case EXAM_MODES.THEORY_MOCK: return 'Theory mock (35)';
    case EXAM_MODES.REVIEW_INCORRECT: return 'Incorrect review';
    case EXAM_MODES.REVIEW_BOOKMARKS: return 'Bookmark review';
    case EXAM_MODES.WEAK_TOPICS: return 'Weak topics';
    case EXAM_MODES.SIGNS: return 'Road signs';
    case EXAM_MODES.HAZARD: return 'Hazard scenarios';
    case EXAM_MODES.RESTRICTED: return 'Restricted prep';
    case EXAM_MODES.LEARN: return 'Learn mode';
    default: return 'Custom exam';
  }
}

// ---------------------------------------------------------------------------
// exam setup
// ---------------------------------------------------------------------------

function selectField(id, labelText, options, value, onChange, helpText) {
  const select = el('select', { id, onChange: (e) => onChange(e.target.value) },
    options.map((o) => el('option', { value: o.value, selected: String(o.value) === String(value), text: o.label })));
  return el('div', { class: 'field' }, [
    el('label', { for: id, text: labelText }),
    select,
    helpText ? el('div', { class: 'help', text: helpText }) : null,
  ]);
}

function radioField(name, labelText, options, value, onChange, helpText) {
  return el('div', { class: 'field' }, [
    el('span', { class: 'field-label', text: labelText }),
    el('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': labelText },
      options.map((o) => el('label', { class: 'choice' }, [
        el('input', {
          type: 'radio', name, value: String(o.value),
          checked: String(o.value) === String(value),
          onChange: () => onChange(o.value),
        }),
        el('span', { text: o.label }),
      ]))),
    helpText ? el('div', { class: 'help', text: helpText }) : null,
  ]);
}

export function renderSetup(ctx) {
  const a = ctx.actions;
  const cfg = ctx.draftConfig;
  const available = ctx.draftAvailable;
  const requested = cfg.count === 'all' ? available : Number(cfg.count);
  const short = requested > available;

  return frag([
    el('h1', { text: 'Set up a practice exam' }),
    el('p', { class: 'lede', text: 'Every setting below is applied when you start. Nothing is revealed until you submit an answer.' }),
    el('section', { class: 'card' }, [
      el('div', { class: 'grid grid-2' }, [
        el('div', {}, [
          radioField('cfg-count', 'Number of questions',
            [10, 20, 35, 50, 'all'].map((n) => ({ value: n, label: n === 'all' ? 'All eligible' : String(n) })),
            cfg.count, (v) => a.updateDraft({ count: v === 'all' ? 'all' : Number(v) })),
          selectField('cfg-topic', 'Topic',
            [{ value: 'all', label: 'All topics' }].concat(TOPICS.map((t) => ({ value: t.key, label: `${t.label} (${ctx.topicCounts[t.key] || 0})` }))),
            cfg.topic, (v) => a.updateDraft({ topic: v })),
          selectField('cfg-difficulty', 'Difficulty',
            [{ value: 'mixed', label: 'Mixed' }].concat(DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))),
            cfg.difficulty, (v) => a.updateDraft({ difficulty: v })),
          selectField('cfg-selection', 'Which questions',
            [
              { value: 'random', label: 'Any question' },
              { value: 'unanswered', label: 'Not yet attempted' },
              { value: 'incorrect', label: 'Previously incorrect' },
              { value: 'bookmarked', label: 'Bookmarked only' },
            ],
            cfg.selection, (v) => a.updateDraft({ selection: v })),
        ]),
        el('div', {}, [
          radioField('cfg-feedback', 'Feedback',
            [
              { value: FEEDBACK_IMMEDIATE, label: 'After each answer' },
              { value: FEEDBACK_END, label: 'At the end' },
            ],
            cfg.feedback, (v) => a.updateDraft({ feedback: v }),
            'Immediate feedback explains every option as you go. End-of-exam feedback mirrors real test conditions and lets you change answers before submitting.'),
          radioField('cfg-timed', 'Timer',
            [{ value: 'off', label: 'Untimed' }, { value: 'on', label: 'Timed' }],
            cfg.timed ? 'on' : 'off',
            (v) => a.updateDraft({ timed: v === 'on', timeLimitSeconds: v === 'on' ? (cfg.timeLimitSeconds || 30 * 60) : null })),
          cfg.timed ? selectField('cfg-time', 'Time limit',
            [10, 20, 30, 45, 60].map((m) => ({ value: m * 60, label: `${m} minutes` })),
            cfg.timeLimitSeconds || 1800, (v) => a.updateDraft({ timeLimitSeconds: Number(v) })) : null,
          selectField('cfg-ruleset', 'Ruleset',
            RULESETS.map((r) => ({ value: r.id, label: `${r.label} (${r.effectiveFrom})` })),
            cfg.ruleset, (v) => a.updateDraft({ ruleset: v }),
            'Questions are marked against the ruleset you choose here.'),
        ]),
      ]),

      short
        ? el('div', { class: 'callout callout-warn' }, [
          el('p', { text: `Only ${available} question${available === 1 ? '' : 's'} match these filters, but you asked for ${requested}. Start anyway and the exam will contain ${available}, or change the filters.` }),
          available > 0 ? el('button', {
            class: 'btn btn-small', type: 'button',
            text: `Reduce to ${available} question${available === 1 ? '' : 's'}`,
            onClick: () => a.updateDraft({ count: available }),
          }) : null,
        ])
        : el('p', { class: 'muted', text: `${available} question${available === 1 ? '' : 's'} match these filters.` }),

      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn btn-primary', type: 'button', text: 'Start exam',
          disabled: available === 0,
          onClick: () => a.startDraft(),
        }),
        el('button', { class: 'btn', type: 'button', text: 'Back to dashboard', onClick: () => a.go('dashboard') }),
      ]),
      available === 0 ? el('p', { class: 'muted', text: 'No questions match. Loosen a filter — for example switch "Which questions" back to "Any question".' }) : null,
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// question card
// ---------------------------------------------------------------------------

function diagramFigure(key) {
  const d = diagramFor(key);
  if (!d) return null;
  const fig = el('figure', { class: 'diagram' });
  insertTrustedSvg(fig, d.markup);
  fig.appendChild(el('figcaption', { text: d.caption }));
  return fig;
}

/**
 * Renders one question. `reveal` controls whether correctness and explanations
 * are shown; it is never true until the candidate has submitted.
 */
export function renderQuestionCard(opts) {
  const q = opts.question;
  const order = opts.order || ['A', 'B', 'C', 'D'];
  const selected = opts.selectedOptionId;
  const reveal = opts.reveal === true;
  const a = opts.actions;

  const displayOptions = order.map((oid, i) => ({
    option: q.options.find((o) => o.id === oid),
    letter: DISPLAY_LETTERS[i],
  })).filter((x) => x.option);

  const header = el('div', { class: 'exam-meta' }, [
    el('span', { class: 'pill pill-topic', text: topicLabel(q.topic) }),
    el('span', { class: `pill pill-${q.difficulty}`, text: DIFFICULTY_LABELS[q.difficulty] || q.difficulty }),
    el('span', { class: 'pill', text: q.id }),
    q.verified === false ? el('span', { class: 'pill pill-unverified', text: 'Awaiting verification' }) : null,
    q._variantApplied ? el('span', { class: 'pill', text: 'Updated for 25 Jan 2027' }) : null,
    a && a.toggleBookmark ? el('button', {
      class: 'btn btn-ghost btn-small', type: 'button',
      'aria-pressed': opts.bookmarked ? 'true' : 'false',
      text: opts.bookmarked ? '★ Bookmarked' : '☆ Bookmark',
      onClick: () => a.toggleBookmark(q.id),
    }) : null,
  ]);

  const body = [header];
  if (opts.counterText) body.push(el('p', { class: 'muted', text: opts.counterText }));
  body.push(el('h2', { class: 'question-text', text: q.question }));
  if (q.scenario) body.push(el('p', { class: 'scenario', text: q.scenario }));
  const fig = q.svg ? diagramFigure(q.svg) : null;
  if (fig) body.push(fig);

  const list = el('ul', { class: 'options' }, displayOptions.map(({ option, letter }) => {
    const isSelected = selected === option.id;
    const isCorrect = option.id === q.correctOptionId;
    let cls = 'option';
    let marker = null;
    if (reveal) {
      if (isCorrect) { cls += ' is-correct'; marker = 'Correct answer'; }
      else if (isSelected) { cls += ' is-incorrect'; marker = 'Your answer'; }
    }
    return el('li', {}, el('button', {
      class: cls,
      type: 'button',
      'aria-pressed': isSelected ? 'true' : 'false',
      disabled: reveal || opts.locked === true,
      onClick: () => a && a.selectOption && a.selectOption(option.id),
    }, [
      el('span', { class: 'letter', text: letter, 'aria-hidden': 'true' }),
      el('span', { class: 'body' }, [
        el('span', { class: 'sr-only', text: `Option ${letter}: ` }),
        option.text,
      ]),
      marker ? el('span', { class: 'marker', text: marker }) : null,
    ]));
  }));
  body.push(list);

  if (reveal) body.push(renderExplanation(q, displayOptions, selected));

  return el('section', { class: 'panel' }, body);
}

export function renderExplanation(q, displayOptions, selectedOptionId) {
  const correctDisplay = displayOptions.find((d) => d.option.id === q.correctOptionId);
  const wasCorrect = selectedOptionId === q.correctOptionId;
  const nodes = [];

  if (selectedOptionId) {
    nodes.push(el('p', {
      class: `verdict ${wasCorrect ? 'ok' : 'no'}`,
      text: wasCorrect ? 'Correct' : 'Not correct',
    }));
  }

  nodes.push(el('h3', { text: 'Correct answer' }));
  nodes.push(el('p', {}, [
    el('strong', { text: `${correctDisplay ? correctDisplay.letter : '?'} — ` }),
    correctDisplay ? correctDisplay.option.text : '',
  ]));

  nodes.push(el('h3', { text: 'Why this answer is correct' }));
  nodes.push(el('p', { text: q.explanation }));

  nodes.push(el('h3', { text: 'Every option explained' }));
  displayOptions.forEach(({ option, letter }) => {
    const isCorrect = option.id === q.correctOptionId;
    nodes.push(el('div', { class: `explain-option${isCorrect ? ' is-correct' : ''}` }, [
      el('div', { class: 'head', text: `Option ${letter} — ${option.text}` }),
      el('p', { text: option.explanation }),
    ]));
  });

  if (q.realWorldExample) {
    nodes.push(el('h3', { text: 'On a New Zealand road' }));
    nodes.push(el('p', { text: q.realWorldExample }));
  }

  nodes.push(el('p', { class: 'source-line' }, [
    'Official source: ',
    el('a', { href: q.sourceUrl, rel: 'noopener', target: '_blank', text: q.sourceTitle || 'NZTA' }),
    ` — ${q.sourceSection}. Verified ${q.lastVerified}.`,
  ]));

  if (q.verified === false && q.verificationNote) {
    nodes.push(el('div', { class: 'callout callout-warn' }, el('p', { text: `Awaiting independent verification: ${q.verificationNote}` })));
  }

  return el('div', { class: 'explain' }, nodes);
}

// ---------------------------------------------------------------------------
// exam view
// ---------------------------------------------------------------------------

export function renderExam(ctx) {
  const a = ctx.actions;
  const exam = ctx.exam;
  const index = exam.cursor;
  const item = exam.items[index];
  if (!item) return el('p', { text: 'This exam has no questions.' });

  const q = resolveQuestion(ctx.questionById(item.qid), exam.config.ruleset);
  const immediate = exam.config.feedback === FEEDBACK_IMMEDIATE;
  const reveal = immediate && item.submitted;
  const total = exam.items.length;
  const answered = exam.items.filter((i) => i.selectedOptionId).length;
  const left = remainingSeconds(exam, ctx.now);

  const bar = el('div', { class: 'exam-bar' }, [
    el('div', { class: 'exam-meta' }, [
      el('strong', { text: examModeLabel(exam.config.mode) }),
      el('span', { text: `Question ${index + 1} of ${total}` }),
      el('span', { class: 'muted', text: `${answered} answered` }),
      immediate ? el('span', { class: 'pill', text: 'Feedback after each answer' })
        : el('span', { class: 'pill', text: 'Feedback at the end' }),
    ]),
    el('div', { class: 'exam-meta' }, [
      left !== null ? el('span', {
        class: `timer${left <= 120 ? ' is-low' : ''}`,
        role: 'timer',
        'aria-label': `Time remaining ${formatDuration(left)}`,
        text: formatDuration(left),
      }) : null,
      el('button', { class: 'btn btn-small btn-danger', type: 'button', text: 'Exit exam', onClick: () => a.exitExam() }),
    ]),
  ]);

  const progress = el('div', {
    class: 'progress-track', role: 'progressbar',
    'aria-valuenow': String(index + 1), 'aria-valuemin': '1', 'aria-valuemax': String(total),
    'aria-label': 'Exam progress',
  }, el('div', { class: 'progress-fill', style: `width:${((index + 1) / total) * 100}%` }));

  const card = renderQuestionCard({
    question: q,
    order: item.order,
    selectedOptionId: item.selectedOptionId,
    reveal,
    locked: false,
    bookmarked: ctx.isBookmarked(q.id),
    actions: {
      selectOption: (oid) => a.selectOption(oid),
      toggleBookmark: (qid) => a.toggleBookmark(qid),
    },
  });

  // Controls
  const controls = el('div', { class: 'exam-controls' });
  const isLast = index === total - 1;

  if (immediate) {
    if (!item.submitted) {
      controls.appendChild(el('button', {
        class: 'btn btn-primary', type: 'button', text: 'Submit answer',
        disabled: !item.selectedOptionId,
        onClick: () => a.submitAnswer(),
      }));
      if (!item.selectedOptionId) controls.appendChild(el('span', { class: 'muted', text: 'Choose an option first.' }));
    } else {
      if (ctx.confidenceTracking && item.confidence === null) {
        // rendered below the card instead
      }
      controls.appendChild(el('button', {
        class: 'btn btn-primary', type: 'button',
        text: isLast ? 'Finish and see results' : 'Next question',
        onClick: () => (isLast ? a.finishExam() : a.next()),
      }));
    }
    controls.appendChild(el('span', { class: 'spacer' }));
    if (index > 0) controls.appendChild(el('button', { class: 'btn btn-small', type: 'button', text: 'Previous', onClick: () => a.prev() }));
  } else {
    controls.appendChild(el('button', {
      class: 'btn', type: 'button', text: 'Previous', disabled: index === 0, onClick: () => a.prev(),
    }));
    controls.appendChild(el('button', {
      class: 'btn', type: 'button', text: 'Next', disabled: isLast, onClick: () => a.next(),
    }));
    controls.appendChild(el('span', { class: 'spacer' }));
    controls.appendChild(el('button', {
      class: 'btn btn-primary', type: 'button', text: 'Submit exam', onClick: () => a.finishExam(),
    }));
  }

  const nodes = [bar, progress, card];

  if (immediate && item.submitted && ctx.confidenceTracking) {
    nodes.push(el('div', { class: 'card card-tight' }, [
      el('div', { class: 'confidence' }, [
        el('span', { text: 'How confident were you?' }),
        ...['low', 'medium', 'high'].map((levelValue) => el('button', {
          class: `btn btn-small${item.confidence === levelValue ? ' btn-primary' : ''}`,
          type: 'button',
          text: levelValue === 'low' ? 'Guessed' : (levelValue === 'medium' ? 'Fairly sure' : 'Certain'),
          onClick: () => a.setConfidence(levelValue),
        })),
      ]),
    ]));
  }

  nodes.push(controls);

  if (!immediate) nodes.push(renderAnswerGrid(exam, a));

  return frag(nodes);
}

function renderAnswerGrid(exam, a) {
  return el('section', { class: 'card card-tight' }, [
    el('h3', { text: 'Your answers' }),
    el('p', { class: 'muted', text: 'Nothing is marked until you submit the exam. You can go back and change any answer.' }),
    el('div', { class: 'btn-row' }, exam.items.map((item, i) => el('button', {
      class: `btn btn-small${i === exam.cursor ? ' btn-primary' : ''}`,
      type: 'button',
      'aria-label': `Go to question ${i + 1}${item.selectedOptionId ? ', answered' : ', not answered'}`,
      text: `${i + 1}${item.selectedOptionId ? '' : '·'}`,
      onClick: () => a.goToQuestion(i),
    }))),
  ]);
}

// ---------------------------------------------------------------------------
// results
// ---------------------------------------------------------------------------

export function renderResults(ctx) {
  const a = ctx.actions;
  const r = ctx.result;
  const exam = ctx.exam;

  const hero = el('section', { class: 'card' }, [
    el('div', { class: 'score-hero' }, [
      el('div', {}, [
        el('div', { class: 'score-dial', text: `${r.correct}/${r.total}` }),
        el('div', { class: 'muted', text: formatPercent(r.percent) }),
      ]),
      el('div', {}, [
        r.passApplicable
          ? el('div', { class: `score-verdict ${r.passed ? 'pass' : 'fail'}`, text: r.passed ? `At or above the ${THEORY_MOCK.passMark}/${THEORY_MOCK.questionCount} benchmark` : `Below the ${THEORY_MOCK.passMark}/${THEORY_MOCK.questionCount} benchmark` })
          : el('div', { class: 'score-verdict', text: examModeLabel(r.mode) }),
        el('p', { class: 'muted', text: `${r.correct} correct · ${r.incorrect} incorrect · ${r.unanswered} unanswered · ${formatDuration(r.elapsedSeconds)} taken` }),
        r.passApplicable
          ? el('p', { class: 'muted', text: 'This is a practice benchmark only. It is not a prediction of the official result and this app is not the official test.' })
          : el('p', { class: 'muted', text: `The ${THEORY_MOCK.passMark}/${THEORY_MOCK.questionCount} learner theory benchmark is only applied to a completed full-length theory mock, so it is not shown here.` }),
      ]),
    ]),
  ]);

  const byTopic = el('section', { class: 'card' }, [
    el('h2', { text: 'Performance by topic' }),
    el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'Topic' }),
        el('th', { class: 'num', text: 'Asked' }),
        el('th', { class: 'num', text: 'Correct' }),
        el('th', { class: 'num', text: 'Accuracy' }),
      ])),
      el('tbody', {}, r.topics.map((t) => el('tr', {}, [
        el('td', { text: t.label }),
        el('td', { class: 'num', text: String(t.total) }),
        el('td', { class: 'num', text: String(t.correct) }),
        el('td', { class: 'num', text: formatPercent(t.accuracy) }),
      ]))),
    ])),
    r.suggestedRevision.length
      ? el('p', {}, [el('strong', { text: 'Suggested revision: ' }), r.suggestedRevision.map(topicLabel).join(', ')])
      : el('p', { class: 'muted', text: 'No topic fell below 70% in this exam.' }),
  ]);

  const controls = el('section', { class: 'card' }, [
    el('h2', { text: 'What next' }),
    el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button', text: `Retry the ${r.incorrectIds.length} incorrect question${r.incorrectIds.length === 1 ? '' : 's'}`,
        disabled: r.incorrectIds.length === 0,
        onClick: () => a.retryIncorrect(r.incorrectIds),
      }),
      el('button', { class: 'btn', type: 'button', text: 'Retake this exam', onClick: () => a.retake() }),
      el('button', { class: 'btn', type: 'button', text: 'New theory mock', onClick: () => a.startTheoryMock() }),
      el('button', { class: 'btn', type: 'button', text: 'Browse all questions', onClick: () => a.go('browse') }),
      el('button', { class: 'btn', type: 'button', text: 'Back to dashboard', onClick: () => a.go('dashboard') }),
    ]),
  ]);

  const reviewHeading = el('h2', { text: 'Review every question' });
  const reviewNote = el('p', { class: 'muted', text: 'Each question below shows the correct answer and an explanation for all four options.' });

  const cards = exam.items.map((item, i) => {
    const q = resolveQuestion(ctx.questionById(item.qid), exam.config.ruleset);
    return renderQuestionCard({
      question: q,
      order: item.order,
      selectedOptionId: item.selectedOptionId,
      reveal: true,
      bookmarked: ctx.isBookmarked(q.id),
      counterText: `Question ${i + 1} of ${exam.items.length}${item.selectedOptionId ? '' : ' — you left this one blank'}`,
      actions: { toggleBookmark: (qid) => a.toggleBookmark(qid) },
    });
  });

  return frag([
    el('h1', { text: 'Exam results' }),
    hero,
    byTopic,
    controls,
    reviewHeading,
    reviewNote,
    ...cards,
  ]);
}

// ---------------------------------------------------------------------------
// browse / learn
// ---------------------------------------------------------------------------

export function renderBrowse(ctx) {
  const a = ctx.actions;
  const f = ctx.browseFilters;

  const toolbar = el('section', { class: 'card' }, [
    el('h2', { text: 'Browse and search the question bank' }),
    el('div', { class: 'browse-toolbar' }, [
      el('div', { class: 'field' }, [
        el('label', { for: 'b-search', text: 'Search' }),
        el('input', {
          id: 'b-search', type: 'search', value: f.search || '',
          placeholder: 'Words, a tag, or a question id',
          onInput: (e) => a.updateBrowse({ search: e.target.value }),
        }),
      ]),
      selectField('b-topic', 'Topic',
        [{ value: 'all', label: 'All topics' }].concat(TOPICS.map((t) => ({ value: t.key, label: t.label }))),
        f.topic, (v) => a.updateBrowse({ topic: v })),
      selectField('b-difficulty', 'Difficulty',
        [{ value: 'mixed', label: 'Any' }].concat(DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))),
        f.difficulty, (v) => a.updateBrowse({ difficulty: v })),
      selectField('b-status', 'Status',
        [
          { value: 'any', label: 'Any status' },
          { value: 'unanswered', label: 'Not yet attempted' },
          { value: 'incorrect', label: 'Last answered incorrectly' },
          { value: 'correct', label: 'Last answered correctly' },
          { value: 'bookmarked', label: 'Bookmarked' },
        ],
        f.status, (v) => a.updateBrowse({ status: v })),
      selectField('b-ruleset', 'Ruleset',
        RULESETS.map((r) => ({ value: r.id, label: r.label })),
        f.ruleset, (v) => a.updateBrowse({ ruleset: v })),
    ]),
    el('p', { class: 'muted', text: `${ctx.browseResults.length} question${ctx.browseResults.length === 1 ? '' : 's'} match.` }),
    el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-small', type: 'button',
        text: ctx.browseReveal ? 'Hide answers' : 'Show answers and explanations',
        onClick: () => a.toggleBrowseReveal(),
      }),
      el('button', {
        class: 'btn btn-small btn-primary', type: 'button',
        text: `Practise these ${Math.min(ctx.browseResults.length, 50)} questions`,
        disabled: ctx.browseResults.length === 0,
        onClick: () => a.practiseFiltered(ctx.browseResults.map((q) => q.id)),
      }),
      el('button', { class: 'btn btn-small', type: 'button', text: 'Clear filters', onClick: () => a.resetBrowse() }),
    ]),
  ]);

  const body = ctx.browseResults.length === 0
    ? el('div', { class: 'callout' }, el('p', { text: 'Nothing matches those filters. Try clearing the search box or switching status back to "Any status".' }))
    : frag(ctx.browsePage.map((q) => {
      const resolved = resolveQuestion(q, f.ruleset);
      if (ctx.browseReveal) {
        return renderQuestionCard({
          question: resolved,
          order: ['A', 'B', 'C', 'D'],
          selectedOptionId: null,
          reveal: true,
          bookmarked: ctx.isBookmarked(q.id),
          actions: { toggleBookmark: (qid) => a.toggleBookmark(qid) },
        });
      }
      const rec = ctx.answerRecord(q.id);
      return el('div', { class: 'result-row' }, [
        el('div', { class: 'meta' }, [
          el('span', { class: 'pill', text: q.id }),
          el('span', { class: 'pill pill-topic', text: topicLabel(q.topic) }),
          el('span', { class: `pill pill-${q.difficulty}`, text: DIFFICULTY_LABELS[q.difficulty] }),
          ctx.isBookmarked(q.id) ? el('span', { class: 'pill', text: '★ bookmarked' }) : null,
          rec && rec.attempts ? el('span', { class: 'muted', text: `${rec.correct}/${rec.attempts} correct` }) : null,
        ]),
        el('div', { class: 'qtext', text: resolved.question }),
      ]);
    }));

  const pager = ctx.browseResults.length > ctx.browsePage.length
    ? el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn', type: 'button',
        text: `Show more (${ctx.browseResults.length - ctx.browsePage.length} remaining)`,
        onClick: () => a.showMoreBrowse(),
      }),
    ])
    : null;

  return frag([
    el('h1', { text: 'Question bank' }),
    el('p', { class: 'lede', text: 'Every question in the app, searchable. Turn on answers to use this as a study list.' }),
    toolbar,
    body,
    pager,
  ]);
}

// ---------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------

export function renderStats(ctx) {
  const s = ctx.overall;
  return frag([
    el('h1', { text: 'Statistics' }),
    el('section', { class: 'card' }, [
      el('h2', { text: 'Overall' }),
      el('div', { class: 'grid grid-stats' }, [
        statTile(s.questionsAttempted, 'Questions attempted'),
        statTile(s.questionsRemaining, 'Never attempted'),
        statTile(s.totalAttempts, 'Total answers given'),
        statTile(formatPercent(s.accuracy), 'Accuracy'),
        statTile(s.currentlyIncorrect, 'Currently wrong'),
        statTile(s.examsTaken, 'Exams completed'),
      ]),
    ]),
    el('section', { class: 'card' }, [
      el('h2', { text: 'Accuracy by topic' }),
      topicTable(ctx.topics),
      el('p', { class: 'muted', text: 'Accuracy counts every answer you have given, so re-answering a question you once got wrong improves the figure gradually rather than instantly.' }),
    ]),
    el('section', { class: 'card' }, [
      el('h2', { text: 'Exam history' }),
      ctx.history.length ? historyTable(ctx.history) : el('p', { class: 'muted', text: 'No completed exams yet.' }),
    ]),
    el('section', { class: 'card' }, [
      el('h2', { text: 'Review schedule' }),
      el('p', { text: `${ctx.dueCount} question${ctx.dueCount === 1 ? ' is' : 's are'} due for review. Questions you get wrong come back almost immediately; ones you answer correctly several times are spaced further apart.` }),
      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn btn-primary', type: 'button', text: 'Practise what is due',
          disabled: ctx.dueCount === 0,
          onClick: () => ctx.actions.practiseDue(),
        }),
      ]),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// restricted module
// ---------------------------------------------------------------------------

export function renderRestricted(ctx) {
  const a = ctx.actions;
  return frag([
    el('h1', { text: 'Restricted Practical Test Preparation' }),
    el('div', { class: 'callout callout-danger' }, [
      el('p', {}, [
        el('strong', { text: 'Read this first. ' }),
        'The restricted licence test is a practical, on-road driving assessment with a testing officer. '
        + 'It is not a multiple-choice examination. Answering the questions in this module correctly does '
        + 'not establish practical driving competence and cannot replace supervised on-road practice, '
        + 'professional instruction, or the official restricted practical test.',
      ]),
      el('p', { text: 'Use these scenarios to rehearse the decisions and observation habits a testing officer is watching for — then go and practise them in a car with your supervisor.' }),
    ]),
    el('section', { class: 'card' }, [
      el('h2', { text: 'What this module covers' }),
      el('p', { class: 'muted', text: 'Observation and scanning · mirror checks · blind spots · signalling · lane positioning · intersections and turning · speed management · following distances · hazard anticipation · safe gap selection · pedestrian and cyclist awareness · safe manoeuvres · common driving errors · restricted licence conditions and passenger rules.' }),
      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn btn-primary', type: 'button',
          text: `Start a ${Math.min(20, ctx.counts.restricted)}-question session`,
          disabled: ctx.counts.restricted === 0,
          onClick: () => a.startMode(EXAM_MODES.RESTRICTED, { count: Math.min(20, ctx.counts.restricted) }),
        }),
        el('button', {
          class: 'btn', type: 'button', text: 'All restricted questions',
          disabled: ctx.counts.restricted === 0,
          onClick: () => a.startMode(EXAM_MODES.RESTRICTED, { count: 'all' }),
        }),
      ]),
      el('p', { class: 'muted', text: `${ctx.counts.restricted} questions available in this module.` }),
    ]),
    el('section', { class: 'card' }, [
      el('h2', { text: 'Restricted licence conditions' }),
      el('p', { text: 'These are the conditions that apply while you hold a restricted car licence. The app marks questions about them against whichever ruleset you have selected.' }),
      el('ul', {}, [
        el('li', { text: 'You may not drive between 10pm and 5am unless a supervisor is in the front passenger seat.' }),
        el('li', { text: 'You may not carry passengers unless a supervisor is with you, apart from the specific exceptions: your spouse or partner, a dependent child in your care, your parent or guardian, a relative living with you who receives a social security benefit, or someone you are the primary caregiver for.' }),
        el('li', { text: 'A supervisor must hold a current full New Zealand car licence and must have held it for at least two years.' }),
        el('li', { text: 'If you are under 20 the alcohol limit is zero. If you are 20 or over the limit is 250 micrograms per litre of breath or 50 milligrams per 100 millilitres of blood.' }),
      ]),
      el('p', { class: 'source-line' }, [
        'Source: ',
        el('a', {
          href: 'https://www.nzta.govt.nz/driver-licences/getting-a-licence/licences-by-vehicle-type/cars/restricted-licence/',
          rel: 'noopener', target: '_blank', text: 'NZTA — restricted licence',
        }),
        `. Verified ${BANK_LAST_VERIFIED}.`,
      ]),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// progress data / settings
// ---------------------------------------------------------------------------

export function renderData(ctx) {
  const a = ctx.actions;
  const rs = rulesetById(ctx.ruleset);

  return frag([
    el('h1', { text: 'Progress data and ruleset' }),

    el('section', { class: 'card' }, [
      el('h2', { text: 'Ruleset' }),
      el('p', { class: 'muted', text: 'Questions are written and marked against a specific set of rules. Future rules are never applied to the current ruleset.' }),
      el('div', { class: 'choice-row' }, RULESETS.map((r) => el('label', { class: 'choice' }, [
        el('input', {
          type: 'radio', name: 'ruleset', value: r.id,
          checked: r.id === ctx.ruleset,
          onChange: () => a.setRuleset(r.id),
        }),
        el('span', { text: `${r.label} — ${r.effectiveFrom}` }),
      ]))),
      el('p', { text: rs.summary }),
      el('p', { class: 'muted', text: `Question bank last verified against official sources on ${BANK_LAST_VERIFIED}.` }),
    ]),

    el('section', { class: 'card' }, [
      el('h2', { text: 'Confirmed changes from 25 January 2027' }),
      el('p', { class: 'muted', text: 'Only these graduated driver licensing changes are modelled. They are not applied while the current ruleset is selected.' }),
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: 'What changes' }),
          el('th', { text: 'Now' }),
          el('th', { text: 'From 25 Jan 2027' }),
        ])),
        el('tbody', {}, CHANGES_2027.map((c) => el('tr', {}, [
          el('td', { text: c.area }),
          el('td', { text: c.current }),
          el('td', { text: c.future }),
        ]))),
      ])),
      el('p', { class: 'source-line' }, [
        'Source: ',
        el('a', {
          href: 'https://www.nzta.govt.nz/driver-licences/getting-a-licence/proposed-changes-to-graduated-driver-licensing/moving-to-the-new-car-licence-system',
          rel: 'noopener', target: '_blank', text: 'NZTA — moving to the new car licence system',
        }),
        `. Verified ${BANK_LAST_VERIFIED}. Details could still be revised before commencement — check the official page.`,
      ]),
    ]),

    el('section', { class: 'card' }, [
      el('h2', { text: 'Appearance' }),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Theme' }),
        el('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': 'Theme' },
          THEME_PREFERENCES.map((pref) => el('label', { class: 'choice' }, [
            el('input', {
              type: 'radio',
              name: 'theme',
              value: pref,
              checked: pref === ctx.themePreference,
              onChange: () => a.setTheme(pref),
            }),
            el('span', { text: themePreferenceLabel(pref) }),
          ]))),
        el('div', {
          class: 'help',
          text: 'Follow system uses your device setting and changes with it. The button in the '
            + 'header switches straight between light and dark.',
        }),
      ]),
    ]),

    el('section', { class: 'card' }, [
      el('h2', { text: 'Study settings' }),
      el('label', { class: 'choice' }, [
        el('input', {
          type: 'checkbox', checked: ctx.confidenceTracking,
          onChange: (e) => a.setConfidenceTracking(e.target.checked),
        }),
        el('span', { text: 'Ask how confident I was after each answer' }),
      ]),
      el('p', { class: 'help', text: 'Confidence ratings flag questions you got right but were unsure about, so they come back sooner.' }),
    ]),

    el('section', { class: 'card' }, [
      el('h2', { text: 'Export and import' }),
      el('p', { text: ctx.persistent ? 'Your progress is stored in this browser only. Export it to move it to another device or keep a backup.' : `Progress cannot be saved in this browser (${ctx.persistentReason}). Export before you close the tab if you want to keep it.` }),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn', type: 'button', text: 'Export progress (JSON)', onClick: () => a.exportProgress() }),
        el('label', { class: 'btn' }, [
          'Import progress',
          el('input', {
            type: 'file', accept: 'application/json,.json', class: 'sr-only',
            onChange: (e) => { const f = e.target.files && e.target.files[0]; if (f) a.importProgress(f); e.target.value = ''; },
          }),
        ]),
      ]),
      el('p', { class: 'help', text: 'Imported files are checked field by field before anything is applied. The file is read as data only — it is never executed.' }),
    ]),

    el('section', { class: 'card' }, [
      el('h2', { text: 'Reset' }),
      el('p', { text: 'Clears every answer, bookmark, exam result and setting stored on this device. The question bank itself is unaffected. This cannot be undone.' }),
      el('button', { class: 'btn btn-danger', type: 'button', text: 'Reset all progress', onClick: () => a.resetProgress() }),
    ]),

    el('section', { class: 'card' }, [
      el('h2', { text: 'About this app' }),
      el('p', { text: `${APP_NAME} is an independent study tool. It is not produced, endorsed or approved by NZTA Waka Kotahi or the AA, and its questions are original — they are not actual examination questions or reproductions of any official or commercial question bank.` }),
      el('p', { text: `The ${THEORY_MOCK.passMark} out of ${THEORY_MOCK.questionCount} benchmark used by the theory mock reflects the published requirement for the learner licence theory test. It is applied only to that mock, never to the restricted practical preparation module.` }),
      el('p', { class: 'muted', text: 'No personal information is collected. Nothing leaves this device.' }),
    ]),
  ]);
}
