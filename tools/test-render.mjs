// Render tests for the view layer.
//
// Runs the built bundle against a small hand-written DOM shim and drives it
// through every screen and the full exam lifecycle, asserting that each render
// produces content and throws nothing.
//
// This is NOT a browser test. It does not verify layout, styling, focus order,
// responsiveness or anything a real rendering engine does. What it does prove
// is that the view functions execute, that the controller wiring is intact,
// and that the exam, scoring, persistence and navigation paths work end to end.
//
//   node tools/test-render.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

let passed = 0;
let failed = 0;
const failures = [];
const queue = [];
// Tests are queued and run in order at the end, because some of them have to
// await a confirmation dialog that resolves on a microtask.
function test(name, fn) { queue.push({ name, fn }); }

// ---------------------------------------------------------------------------
// a very small DOM
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeNode(tagName, namespaceURI) {
  const node = {
    nodeType: 1,
    nodeName: tagName.toUpperCase(),
    tagName: tagName.toUpperCase(),
    namespaceURI: namespaceURI || null,
    childNodes: [],
    attributes: {},
    listeners: {},
    parentNode: null,
    className: '',
    dataset: {},
    value: '',
    checked: false,
    disabled: false,
    files: [],
    style: { cssText: '' },
    classList: {
      add(c) { if (!node.className.split(' ').includes(c)) node.className = `${node.className} ${c}`.trim(); },
      remove(c) { node.className = node.className.split(' ').filter((x) => x && x !== c).join(' '); },
      contains(c) { return node.className.split(' ').includes(c); },
    },
    appendChild(child) {
      // Real DOM semantics: appending a fragment moves its children, not itself.
      if (child.nodeType === 11) {
        child.childNodes.slice().forEach((c) => node.appendChild(c));
        child.childNodes = [];
        return child;
      }
      child.parentNode = node;
      node.childNodes.push(child);
      return child;
    },
    removeChild(child) {
      const i = node.childNodes.indexOf(child);
      if (i >= 0) node.childNodes.splice(i, 1);
      child.parentNode = null;
      return child;
    },
    setAttribute(k, v) {
      node.attributes[k] = String(v);
      // Real elements reflect these attributes onto properties; the app reads
      // the property, so the shim has to mirror that or tests lie.
      if (k === 'checked') node.checked = true;
      if (k === 'disabled') node.disabled = true;
      if (k === 'value') node.value = String(v);
    },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(node.attributes, k) ? node.attributes[k] : null; },
    removeAttribute(k) { delete node.attributes[k]; },
    addEventListener(type, fn) { (node.listeners[type] = node.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      node.listeners[type] = (node.listeners[type] || []).filter((f) => f !== fn);
    },
    dispatch(type, ev) { (node.listeners[type] || []).forEach((f) => f({ target: node, currentTarget: node, preventDefault() {}, ...(ev || {}) })); },
    click() { node.dispatch('click', {}); },
    focus() { shimDocument.activeElement = node; },
    querySelectorAll(sel) { return queryAll(node, sel); },
    querySelector(sel) { return queryAll(node, sel)[0] || null; },
    get firstChild() { return node.childNodes[0] || null; },
    get textContent() {
      return node.childNodes.map((c) => (c.nodeType === 3 ? c.data : c.textContent)).join('');
    },
    set textContent(v) {
      node.childNodes = [];
      if (v !== '') node.appendChild(makeText(String(v)));
    },
  };
  return node;
}

function makeText(data) {
  return { nodeType: 3, data, parentNode: null, childNodes: [], get textContent() { return this.data; } };
}

function makeFragment() {
  const f = makeNode('#fragment');
  f.nodeType = 11;
  return f;
}

function matches(node, sel) {
  if (node.nodeType !== 1) return false;
  if (sel.startsWith('.')) return node.classList.contains(sel.slice(1));
  if (sel.startsWith('[')) {
    const m = /^\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]$/.exec(sel);
    if (!m) return false;
    const v = node.getAttribute(m[1]);
    return m[2] === undefined ? v !== null : v === m[2];
  }
  return node.tagName === sel.toUpperCase();
}

function queryAll(node, sel) {
  const out = [];
  const walk = (n) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType !== 1) return;
      if (matches(c, sel)) out.push(c);
      walk(c);
    });
  };
  walk(node);
  return out;
}

const roots = {};
['app-nav', 'ruleset-bar', 'view-root', 'dialog-root', 'toast-root', 'main', 'theme-toggle-slot'].forEach((id) => {
  roots[id] = makeNode('div');
  roots[id].setAttribute('id', id);
});

const timers = [];
const shimDocument = {
  readyState: 'complete',
  activeElement: null,
  createElement: (t) => makeNode(t),
  createTextNode: (d) => makeText(d),
  createDocumentFragment: () => makeFragment(),
  getElementById: (id) => roots[id] || null,
  querySelector: (sel) => {
    for (const r of Object.values(roots)) { const f = queryAll(r, sel)[0]; if (f) return f; }
    return null;
  },
  importNode: (n) => n,
  addEventListener() {},
  removeEventListener() {},
  documentElement: makeNode('html'),
  body: makeNode('body'),
};

class ShimDOMParser {
  // Good enough for the diagram registry: the markup is always a single <svg>.
  parseFromString(markup) {
    const ok = /^<svg\b/.test(markup.trim()) && markup.trim().endsWith('</svg>');
    const el = makeNode('svg', ok ? SVG_NS : null);
    if (!ok) el.nodeName = 'parsererror';
    el.setAttribute('data-len', String(markup.length));
    return { documentElement: el };
  }
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// Drives prefers-color-scheme so the theme logic can be exercised.
let systemPrefersDark = false;
const mediaListeners = [];

const shimWindow = {
  addEventListener() {},
  removeEventListener() {},
  matchMedia(query) {
    const mq = {
      media: query,
      get matches() { return query.includes('dark') && systemPrefersDark; },
      addEventListener(type, fn) { if (type === 'change') mediaListeners.push(fn); },
      removeEventListener() {},
    };
    return mq;
  },
  localStorage: memoryStorage(),
  setInterval(fn) { timers.push(fn); return timers.length; },
  clearInterval() {},
  setTimeout() { return 0; },
  clearTimeout() {},
  scrollTo() {},
};

const sandbox = {
  console, Math, JSON, Date, Set, Map, Object, Array, String, Number, Boolean,
  Error, RegExp, Promise, Symbol, isNaN, parseInt, parseFloat,
  document: shimDocument,
  window: shimWindow,
  DOMParser: ShimDOMParser,
  URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
  Blob: class {},
  FileReader: class {},
  __probe: {},
};
sandbox.globalThis = sandbox;

// Expose the controller for driving: append a tiny epilogue that publishes the
// internals the test needs. This does not change the shipped file.
const html = readFileSync(join(root, 'nz-road-code-master.html'), 'utf8');
const code = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1].replace(/<\\\/script/g, '</script');
const probed = code.replace(/\n\}\)\(\);\s*$/, '\n__probe.actions = actions;\n__probe.app = app;\n__probe.render = render;\n__probe.QUESTIONS = QUESTIONS;\n})();\n');
assert.notEqual(probed, code, 'could not attach the test probe to the bundle');

vm.createContext(sandbox);
new vm.Script(probed, { filename: 'nz-road-code-master.html' }).runInContext(sandbox, { timeout: 20000 });

const { actions, app, QUESTIONS } = sandbox.__probe;
const viewRoot = roots['view-root'];
const dialogRoot = roots['dialog-root'];
const text = () => viewRoot.textContent;

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

// Clicks the primary button of whatever confirmation dialog is open, then lets
// its promise settle. Exiting an exam and resetting progress both use one.
async function confirmYes() {
  const btn = queryAll(dialogRoot, 'button')[0];
  assert.ok(btn, 'expected a confirmation dialog to be open');
  btn.click();
  await flush();
}

async function leaveExam() {
  if (app.view !== 'exam') return;
  actions.exitExam();
  await confirmYes();
}

// ---------------------------------------------------------------------------

test('the bundle boots and renders the dashboard', () => {
  assert.ok(viewRoot.childNodes.length > 0, 'view root is empty after boot');
  assert.ok(text().includes('NZ Road Code Master'), 'dashboard title missing');
  assert.ok(text().includes('How you are tracking'), 'readiness section missing');
  assert.ok(text().includes('Practise'), 'practice section missing');
});

test('the dashboard leads with exactly one primary action', () => {
  const hero = queryAll(viewRoot, '.next-step')[0];
  assert.ok(hero, 'no primary action rendered');
  const primaries = queryAll(viewRoot, '.btn-primary');
  assert.equal(primaries.length, 1, `expected one filled button on the dashboard, saw ${primaries.length}`);
  assert.ok(hero.textContent.includes(primaries[0].textContent), 'the filled button is not the primary action');
});

test('a first-time visitor is offered a question, not a configuration screen', () => {
  // Fresh state: no answers recorded yet.
  assert.equal(app.state.settings.theme !== undefined, true);
  assert.equal(Object.keys(app.state.answers).length, 0, 'precondition: state should be empty');
  const hero = queryAll(viewRoot, '.next-step')[0];
  assert.ok(hero.textContent.includes('Start here'), 'the hero is not framed as a starting point');
  assert.ok(hero.textContent.includes('Try five questions'), 'no immediate taster offered');
  assert.ok(hero.textContent.includes('Answer a question now'), 'the call to action is not immediate');
  assert.ok(hero.textContent.includes('browse all'), 'no explore-first alternative offered');
});

test('the taster starts five questions with no setup screen in between', () => {
  const hero = queryAll(viewRoot, '.next-step')[0];
  const cta = queryAll(hero, 'button').find((b) => b.textContent.includes('Answer a question now'));
  cta.click();
  assert.equal(app.view, 'exam', 'the taster did not go straight into questions');
  assert.equal(app.exam.items.length, 5);
  assert.equal(app.exam.config.feedback, 'immediate', 'a taster should explain as you go');
  assert.equal(app.exam.timeLimitSeconds, null, 'a taster should not be timed');
  app.exam = null;
  app.view = 'dashboard';
  actions.go('dashboard');
});

test('the dashboard still reaches every practice mode and every screen', () => {
  ['mock exam', 'Questions you got wrong', 'Road signs',
    'Hazard scenarios', 'Restricted practical prep', 'Bookmarks', 'Build your own',
    'Browse all questions', 'Statistics and history', 'Progress data and settings'].forEach((label) => {
    assert.ok(text().includes(label), `dashboard no longer reaches "${label}"`);
  });
  assert.ok(text().includes(String(QUESTIONS.length)), 'question count not shown');
  // The weak-topic tile is labelled honestly: with no attempts there is nothing
  // measurably weak, so it must not present the whole bank as a weakness.
  assert.ok(
    text().includes('Topics you have not started'),
    'the weak-topic tile overclaims on an empty profile',
  );
  assert.ok(!text().includes('Weak topics'), 'an empty profile should not claim weak topics');
});

test('readiness refuses to claim anything on an empty profile, and shows its working', () => {
  assert.ok(text().includes('Not enough practice yet'), 'readiness overclaims on an empty profile');
  assert.ok(text().includes('Questions seen'), 'the figures behind the verdict are not shown');
  assert.ok(
    text().includes('not a prediction of the official test result'),
    'the readiness signal does not disclaim being a prediction',
  );
});

test('the navigation and ruleset bars render', () => {
  assert.ok(roots['app-nav'].textContent.includes('Dashboard'), 'nav missing');
  assert.ok(roots['app-nav'].textContent.includes('Restricted prep'), 'nav missing restricted');
  assert.ok(roots['ruleset-bar'].textContent.includes('Current rules'), 'ruleset bar missing');
  assert.ok(roots['ruleset-bar'].textContent.includes('275 questions'), 'bank size not shown');
});

test('the app states it is not an official NZTA service', () => {
  // The theme follows the NZTA website palette, so this notice has to be
  // present in the chrome on every screen, not only in the footer prose.
  const bar = roots['ruleset-bar'].textContent;
  assert.ok(bar.includes('Independent study tool'), 'independence notice missing from the chrome');
  assert.ok(bar.includes('not an official NZTA service'), 'the notice does not disclaim NZTA');
  const pill = queryAll(roots['ruleset-bar'], '.pill-independent')[0];
  assert.ok(pill, 'the notice is not rendered as its own pill');
  assert.ok(pill.getAttribute('title').includes('not produced or endorsed'), 'pill tooltip missing');
});

// --- theme -----------------------------------------------------------------

const themeAttr = () => shimDocument.documentElement.getAttribute('data-theme');
const themeButton = () => queryAll(roots['theme-toggle-slot'], 'button')[0];

test('the app applies a resolved theme to the document on boot', () => {
  assert.ok(['light', 'dark'].includes(themeAttr()), `data-theme is "${themeAttr()}"`);
  assert.equal(themeAttr(), 'light', 'the shim system preference is light, so light should apply');
  assert.equal(app.state.settings.theme, 'system', 'the stored preference should start as system');
});

test('the header renders a theme toggle describing its action', () => {
  const btn = themeButton();
  assert.ok(btn, 'no theme toggle rendered into the header');
  assert.match(btn.getAttribute('aria-label'), /switch to the dark theme/i);
  assert.ok(btn.textContent.includes('Dark'), 'the toggle does not name the theme it switches to');
});

test('clicking the toggle switches the document to dark and back', () => {
  themeButton().click();
  assert.equal(themeAttr(), 'dark', 'document did not switch to dark');
  assert.equal(app.state.settings.theme, 'dark', 'preference was not stored');
  assert.match(themeButton().getAttribute('aria-label'), /switch to the light theme/i);
  assert.ok(themeButton().textContent.includes('Light'), 'the toggle label did not flip');

  themeButton().click();
  assert.equal(themeAttr(), 'light', 'document did not switch back to light');
  assert.equal(app.state.settings.theme, 'light');
});

test('the theme survives a reload from storage', () => {
  actions.setTheme('dark');
  assert.equal(themeAttr(), 'dark');
  const stored = JSON.parse(shimWindow.localStorage.getItem('nzrcm.v1.state'));
  assert.equal(stored.settings.theme, 'dark', 'the preference was not persisted');
});

test('the appearance setting offers all three preferences', () => {
  actions.go('data');
  assert.ok(text().includes('Appearance'), 'no appearance section on the data screen');
  assert.ok(text().includes('Follow system'), 'the system option is missing');
  assert.ok(text().includes('Light') && text().includes('Dark'), 'light/dark options missing');
  const radios = queryAll(viewRoot, 'input').filter((i) => i.getAttribute('name') === 'theme');
  assert.equal(radios.length, 3, `expected three theme radios, saw ${radios.length}`);
  const checked = radios.filter((r) => r.checked);
  assert.equal(checked.length, 1, 'exactly one theme radio should be checked');
  assert.equal(checked[0].getAttribute('value'), 'dark', 'the checked radio should match the preference');
});

test('choosing "follow system" tracks the operating system both ways', () => {
  systemPrefersDark = true;
  actions.setTheme('system');
  assert.equal(themeAttr(), 'dark', 'following a dark system should render dark');

  // Simulate the OS flipping to light while the app is open.
  systemPrefersDark = false;
  mediaListeners.forEach((fn) => fn({ matches: false }));
  assert.equal(themeAttr(), 'light', 'the app did not follow the system back to light');
  assert.equal(app.state.settings.theme, 'system', 'following the system should not be overwritten');
});

test('an explicit choice ignores later system changes', () => {
  actions.setTheme('light');
  systemPrefersDark = true;
  mediaListeners.forEach((fn) => fn({ matches: true }));
  assert.equal(themeAttr(), 'light', 'an explicit light choice was overridden by the system');
  systemPrefersDark = false;
  actions.setTheme('system');
});

test('an invalid theme is refused rather than applied', () => {
  actions.setTheme('light');
  actions.setTheme('neon');
  assert.equal(app.state.settings.theme, 'light', 'junk was written to the stored preference');
  assert.equal(themeAttr(), 'light');
  actions.setTheme('system');
});

test('every view still renders in the dark theme', () => {
  actions.setTheme('dark');
  ['dashboard', 'setup', 'browse', 'stats', 'restricted', 'data'].forEach((view) => {
    actions.go(view);
    assert.ok(viewRoot.childNodes.length > 0, `${view} rendered nothing in dark mode`);
    assert.ok(!text().includes('Something went wrong'), `${view} hit the error boundary in dark mode`);
  });
  assert.equal(themeAttr(), 'dark', 'navigating lost the theme');
  actions.setTheme('system');
  actions.go('dashboard');
});

// --- views -----------------------------------------------------------------

test('every top-level view renders without throwing', () => {
  ['setup', 'browse', 'stats', 'restricted', 'data', 'dashboard'].forEach((view) => {
    actions.go(view);
    assert.ok(viewRoot.childNodes.length > 0, `${view} rendered nothing`);
    assert.ok(!text().includes('Something went wrong'), `${view} hit the error boundary`);
  });
});

test('the setup screen shows filters and an eligible count', () => {
  actions.go('setup');
  assert.ok(text().includes('Set up a practice exam'));
  assert.ok(text().includes('Number of questions'));
  assert.ok(text().includes('question') && /\d+ questions match these filters/.test(text()));
});

test('the restricted module shows its practical-test disclaimer', () => {
  actions.go('restricted');
  assert.ok(text().includes('practical, on-road driving assessment'), 'missing practical test notice');
  assert.ok(text().includes('cannot replace supervised'), 'missing supervised practice notice');
  assert.ok(text().includes('10pm and 5am'), 'missing night condition');
});

test('the data screen shows both rulesets and the 2027 change table', () => {
  actions.go('data');
  assert.ok(text().includes('Current rules'));
  assert.ok(text().includes('From 25 January 2027'));
  assert.ok(text().includes('Full licence practical test'), 'missing 2027 change row');
  assert.ok(text().includes('Reset all progress'));
});

// --- exam lifecycle --------------------------------------------------------

test('a theory mock starts with 35 questions and a timer', () => {
  actions.startTheoryMock();
  assert.equal(app.view, 'exam');
  assert.equal(app.exam.items.length, 35);
  assert.equal(app.exam.timeLimitSeconds, 1800);
  assert.ok(text().includes('Question 1 of 35'), 'question counter missing');
  assert.ok(text().includes('30:00'), 'timer not showing 30:00');
});

test('the exam view shows four options and no answer before submission', () => {
  const options = queryAll(viewRoot, '.option');
  assert.equal(options.length, 4, 'expected four option buttons');
  assert.ok(!text().includes('Correct answer'), 'the answer was revealed before submission');
  assert.ok(!text().includes('Why this answer is correct'), 'explanation shown before submission');
  options.forEach((o) => assert.equal(o.getAttribute('aria-pressed'), 'false'));
});

test('end-of-exam mode allows navigation and answer changes without marking', () => {
  actions.selectOption(app.exam.items[0].order[0]);
  assert.equal(app.exam.items[0].selectedOptionId, app.exam.items[0].order[0]);
  actions.selectOption(app.exam.items[0].order[2]);
  assert.equal(app.exam.items[0].selectedOptionId, app.exam.items[0].order[2], 'answer could not be changed');
  assert.ok(!text().includes('Correct answer'), 'marked before final submission');
  actions.next();
  assert.ok(text().includes('Question 2 of 35'));
  actions.prev();
  assert.ok(text().includes('Question 1 of 35'));
  actions.goToQuestion(10);
  assert.ok(text().includes('Question 11 of 35'));
});

test('a completed theory mock scores and shows the benchmark', () => {
  app.exam.items.forEach((item, i) => {
    const q = QUESTIONS.find((x) => x.id === item.qid);
    app.exam.cursor = i;
    actions.selectOption(q.correctOptionId);
  });
  actions.finishExam();
  assert.equal(app.view, 'results', 'did not reach the results screen');
  assert.equal(app.result.correct, 35);
  assert.equal(app.result.passApplicable, true);
  assert.equal(app.result.passed, true);
  assert.ok(text().includes('35/35'), 'score not shown');
  assert.ok(text().includes('At or above the 32/35 benchmark'), 'benchmark verdict missing');
  assert.ok(text().includes('Performance by topic'), 'topic breakdown missing');
  assert.ok(text().includes('Review every question'), 'review section missing');
});

test('the results screen explains every option of every question', () => {
  const heads = queryAll(viewRoot, '.explain-option');
  assert.equal(heads.length, 35 * 4, `expected 140 option explanations, saw ${heads.length}`);
  assert.ok(text().includes('Official source:'), 'source attribution missing');
});

test('an immediate-feedback exam locks the answer and reveals explanations', () => {
  actions.startExam({ mode: 'custom', count: 5, feedback: 'immediate', timed: false });
  assert.equal(app.exam.items.length, 5);
  const first = app.exam.items[0];
  const chosen = first.order[1];
  actions.selectOption(chosen);
  assert.ok(!text().includes('Why this answer is correct'), 'revealed before submit');
  actions.submitAnswer();
  assert.equal(first.submitted, true);
  assert.ok(text().includes('Why this answer is correct'), 'explanation not shown after submit');
  assert.ok(text().includes('Every option explained'), 'per-option explanations missing');
  actions.selectOption(first.order[3]);
  assert.equal(first.selectedOptionId, chosen, 'answer was not locked after submission');
});

test('the answer is recorded in progress and the dashboard reflects it', async () => {
  const qid = app.exam.items[0].qid;
  // The custom exam draws at random, so this question may already have been
  // answered during the theory mock; what matters is that the attempt landed.
  assert.ok(app.state.answers[qid], 'answer was not recorded');
  assert.ok(app.state.answers[qid].attempts >= 1, 'attempt count was not incremented');
  assert.ok(['correct', 'incorrect'].includes(app.state.answers[qid].lastResult), 'no result recorded');
  assert.ok(app.state.history.length >= 1, 'completed exam not added to history');
  await leaveExam();
  assert.ok(text().includes('Recent results'), 'recent results not shown after an exam');
});

test('exiting an exam asks for confirmation and records nothing', async () => {
  const historyBefore = app.state.history.length;
  actions.startExam({ mode: 'custom', count: 4, feedback: 'end', timed: false });
  actions.selectOption(app.exam.items[0].order[0]);
  actions.exitExam();
  assert.ok(dialogRoot.textContent.includes('Exit this exam?'), 'no exit confirmation shown');
  await confirmYes();
  assert.equal(app.view, 'dashboard', 'did not return to the dashboard');
  assert.equal(app.exam, null, 'exam was not discarded');
  assert.equal(app.state.history.length, historyBefore, 'abandoned exam was recorded in history');
  // The dashboard mentions the benchmark on its mock-exam tile; what must not
  // appear is a pass or fail verdict for the exam that was abandoned.
  assert.ok(!text().includes('At or above the'), 'an abandoned exam showed a pass verdict');
  assert.ok(!text().includes('Below the 32/35'), 'an abandoned exam showed a fail verdict');
});

test('bookmarking works and the bookmark review mode finds it', async () => {
  const qid = QUESTIONS[0].id;
  actions.toggleBookmark(qid);
  assert.deepEqual(Array.from(app.state.bookmarks), [qid]);
  actions.startMode('review-bookmarks');
  assert.equal(app.exam.items.length, 1);
  assert.equal(app.exam.items[0].qid, qid);
  await leaveExam();
  actions.toggleBookmark(qid);
  assert.deepEqual(Array.from(app.state.bookmarks), []);
});

test('browse filters narrow the list and a bad filter explains itself', () => {
  actions.go('browse');
  actions.updateBrowse({ search: 'roundabout' });
  assert.ok(/\d+ questions match/.test(text()), 'match count missing');
  actions.updateBrowse({ search: 'zzzzznotathing' });
  assert.ok(text().includes('Nothing matches those filters'), 'empty-filter message missing');
  actions.resetBrowse();
  actions.toggleBrowseReveal();
  assert.ok(text().includes('Why this answer is correct'), 'study mode did not reveal answers');
  actions.toggleBrowseReveal();
});

test('switching ruleset changes the 2027 questions', async () => {
  actions.setRuleset('2027-01-25');
  assert.equal(app.state.settings.ruleset, '2027-01-25');
  assert.ok(roots['ruleset-bar'].textContent.includes('From 25 January 2027'));
  actions.startExam({ mode: 'custom', ids: ['NZRC-249'], count: 1, feedback: 'immediate' });
  const item = app.exam.items[0];
  app.exam.cursor = 0;
  actions.selectOption('C'); // the 2027 answer
  actions.submitAnswer();
  assert.equal(app.state.answers['NZRC-249'].lastResult, 'correct', '2027 answer key not applied');
  await leaveExam();
  actions.setRuleset('current');
});

test('statistics render with real figures', () => {
  actions.go('stats');
  assert.ok(text().includes('Accuracy by topic'));
  assert.ok(text().includes('Exam history'));
  assert.ok(text().includes('Review schedule'));
});

test('reset asks for confirmation and clears progress', async () => {
  assert.ok(Object.keys(app.state.answers).length > 0, 'nothing to reset');
  actions.go('data');
  actions.resetProgress();
  assert.ok(dialogRoot.textContent.includes('Reset all progress?'), 'no reset confirmation shown');
  await confirmYes();
  assert.deepEqual(Object.keys(app.state.answers), []);
  assert.deepEqual(Array.from(app.state.history), []);
  actions.go('dashboard');
  assert.ok(text().includes('Try five questions'), 'dashboard did not return to its first-run state');
  assert.ok(text().includes('Not enough practice yet'), 'readiness was not reset with the progress');
});

test('questions with a diagram render a figure with a caption', async () => {
  const withSvg = QUESTIONS.find((q) => q.svg);
  actions.startExam({ mode: 'custom', ids: [withSvg.id], count: 1, feedback: 'immediate' });
  const figures = queryAll(viewRoot, 'figure');
  assert.equal(figures.length, 1, 'no diagram figure rendered');
  assert.ok(!figures[0].textContent.includes('Diagram unavailable'), 'diagram failed to parse');
  assert.ok(figures[0].textContent.length > 10, 'diagram caption missing');
  await leaveExam();
});

test('every question in the bank renders in study mode without throwing', () => {
  actions.go('browse');
  actions.resetBrowse();
  actions.toggleBrowseReveal();
  let shown = 0;
  while (shown < QUESTIONS.length) {
    const before = shown;
    actions.showMoreBrowse();
    shown = queryAll(viewRoot, '.options').length;
    if (shown === before) break;
  }
  assert.equal(shown, QUESTIONS.length, `only ${shown} of ${QUESTIONS.length} questions rendered`);
  assert.ok(!text().includes('Something went wrong'), 'a question hit the error boundary');
  actions.toggleBrowseReveal();
  actions.go('dashboard');
});

for (const t of queue) {
  try {
    // eslint-disable-next-line no-await-in-loop
    await t.fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    failures.push({ name: t.name, message: e.message });
  }
}

console.log('');
if (failures.length) {
  console.log(`FAILURES (${failures.length})`);
  failures.forEach((f) => console.log(`  x ${f.name}\n      ${f.message.split('\n')[0]}`));
  console.log('');
}
console.log(`${passed} passed, ${failed} failed  (view layer against a DOM shim, not a browser)`);
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
