// Question-bank validator: the structural, anti-pattern and consistency gate
// required by section 18 of the brief.
//
//   node tools/validate.mjs                 validate the whole bank
//   node tools/validate.mjs --topic signs   validate one topic only
//   node tools/validate.mjs --json          machine-readable output
//   node tools/validate.mjs --warnings-ok   exit 0 even with warnings
//
// Errors always fail the run. Warnings fail the run unless --warnings-ok,
// so a flagged question has to be fixed or deliberately waved through.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { QUESTIONS } from '../src/questions/index.js';
import {
  TOPICS, TOPIC_KEYS, DIFFICULTIES, OPTION_IDS, RULESET_CURRENT, RULESET_2027,
  questionIdNumber, topicByKey,
} from '../src/core/schema.js';
import { createRng, shuffle } from '../src/core/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const letterPlan = JSON.parse(readFileSync(join(here, 'letter-plan.json'), 'utf8')).plan;

const args = process.argv.slice(2);
const topicFilter = args.includes('--topic') ? args[args.indexOf('--topic') + 1] : null;
const asJson = args.includes('--json');
const warningsOk = args.includes('--warnings-ok');

const PLACEHOLDERS = [/\bTODO\b/i, /\bTBD\b/i, /lorem ipsum/i, /\bFIXME\b/i, /\bplaceholder\b/i, /^\s*\.\.\.\s*$/];
const ABSOLUTES = ['always', 'never', 'only', 'immediately'];
const QUALIFIERS = ['unless', 'except', 'if ', 'provided', 'when '];
const OFFICIAL_HOSTS = ['nzta.govt.nz', 'drive.govt.nz', 'legislation.govt.nz', 'police.govt.nz'];

const errors = [];
const warnings = [];
const err = (id, msg) => errors.push({ id, msg });
const warn = (id, msg) => warnings.push({ id, msg });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const normalise = (s) => String(s || '')
  .toLowerCase()
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const wordCount = (s) => normalise(s).split(' ').filter(Boolean).length;
const sentenceCount = (s) => String(s || '').split(/[.!?]+(?:\s|$)/).filter((x) => x.trim().length).length;

function lengthStats(texts) {
  const lens = texts.map((t) => String(t).length);
  const max = Math.max(...lens);
  const min = Math.min(...lens);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  return { lens, max, min, mean, diffPercent: mean ? ((max - min) / mean) * 100 : 0 };
}

function containsAny(text, needles) {
  const t = ` ${String(text).toLowerCase()} `;
  return needles.some((n) => t.includes(n.toLowerCase()));
}

// ---------------------------------------------------------------------------
// per-question checks
// ---------------------------------------------------------------------------

const bank = topicFilter ? QUESTIONS.filter((q) => q.topic === topicFilter) : QUESTIONS;

if (topicFilter && !TOPIC_KEYS.includes(topicFilter)) {
  console.error(`Unknown topic "${topicFilter}". Known: ${TOPIC_KEYS.join(', ')}`);
  process.exit(2);
}

const seenIds = new Map();
const seenQuestionText = new Map();
const flaggedForLength = [];
let correctIsLongest = 0;
let correctIsShortest = 0;
let diffPercentSum = 0;
let diffPercentMax = 0;
let diffPercentMaxId = null;
let parityExempt = 0;

bank.forEach((q) => {
  const id = q.id || '(missing id)';

  // --- identity -----------------------------------------------------------
  if (!/^NZRC-\d{3,}$/.test(String(q.id))) err(id, 'id must match NZRC-### format');
  if (seenIds.has(q.id)) err(id, `duplicate id (also used by index ${seenIds.get(q.id)})`);
  seenIds.set(q.id, q.id);

  const n = questionIdNumber(q.id);
  const topic = topicByKey(q.topic);
  if (!topic) {
    err(id, `unknown topic "${q.topic}"`);
  } else if (Number.isFinite(n) && (n < topic.idFrom || n > topic.idTo)) {
    err(id, `id is outside the ${q.topic} block (${topic.idFrom}-${topic.idTo})`);
  }

  if (!DIFFICULTIES.includes(q.difficulty)) err(id, `difficulty must be one of ${DIFFICULTIES.join('/')}`);

  // --- rulesets -----------------------------------------------------------
  if (!Array.isArray(q.rulesets) || !q.rulesets.length) {
    err(id, 'rulesets must be a non-empty array');
  } else {
    q.rulesets.forEach((r) => {
      if (r !== RULESET_CURRENT && r !== RULESET_2027) err(id, `unknown ruleset "${r}"`);
    });
    if (q.variant2027 && !q.rulesets.includes(RULESET_2027)) {
      err(id, 'has variant2027 but does not list the 2027 ruleset');
    }
  }

  // --- text ---------------------------------------------------------------
  if (!q.question || String(q.question).trim().length < 15) err(id, 'question text is missing or too short');
  PLACEHOLDERS.forEach((re) => {
    if (re.test(q.question || '')) err(id, 'question text contains a placeholder');
  });

  // --- options ------------------------------------------------------------
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    err(id, 'must have exactly 4 options');
    return;
  }
  const ids = q.options.map((o) => o.id);
  OPTION_IDS.forEach((oid) => {
    if (!ids.includes(oid)) err(id, `missing option ${oid}`);
  });
  if (new Set(ids).size !== 4) err(id, 'option ids are not unique');

  q.options.forEach((o) => {
    if (!o.text || String(o.text).trim().length < 2) err(id, `option ${o.id}: empty text`);
    if (!o.explanation || String(o.explanation).trim().length < 40) {
      err(id, `option ${o.id}: explanation missing or shorter than 40 characters`);
    }
    PLACEHOLDERS.forEach((re) => {
      if (re.test(o.text || '') || re.test(o.explanation || '')) err(id, `option ${o.id}: contains a placeholder`);
    });
    // An explanation that just points at another letter teaches nothing.
    if (/^\s*(this is )?(in)?correct\.?\s*$/i.test(String(o.explanation || '').trim())) {
      err(id, `option ${o.id}: explanation is generic`);
    }
  });

  const normalisedOptions = q.options.map((o) => normalise(o.text));
  normalisedOptions.forEach((t, i) => {
    for (let j = i + 1; j < normalisedOptions.length; j += 1) {
      if (t && t === normalisedOptions[j]) err(id, `options ${q.options[i].id} and ${q.options[j].id} are equivalent`);
    }
  });

  // --- answer key ---------------------------------------------------------
  if (!OPTION_IDS.includes(q.correctOptionId)) {
    err(id, 'correctOptionId is not A/B/C/D');
  } else if (!ids.includes(q.correctOptionId)) {
    err(id, 'correctOptionId does not match any option');
  } else if (letterPlan[q.id] && letterPlan[q.id] !== q.correctOptionId) {
    err(id, `correct answer is ${q.correctOptionId} but the balanced letter plan assigns ${letterPlan[q.id]}`);
  }

  if (!q.explanation || String(q.explanation).trim().length < 60) {
    err(id, 'top-level explanation missing or too short');
  }

  // --- sourcing -----------------------------------------------------------
  if (!q.sourceUrl || !/^https:\/\//.test(q.sourceUrl)) {
    err(id, 'sourceUrl missing or not https');
  } else if (!OFFICIAL_HOSTS.some((h) => q.sourceUrl.includes(h))) {
    warn(id, `sourceUrl host is not an official NZ source (${q.sourceUrl})`);
  }
  if (!q.sourceSection || String(q.sourceSection).trim().length < 3) err(id, 'sourceSection missing');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(q.lastVerified || ''))) err(id, 'lastVerified must be YYYY-MM-DD');
  if (q.verified !== true && q.verified !== false) err(id, 'verified must be a boolean');
  if (q.verified === false && !q.verificationNote) err(id, 'unverified questions need a verificationNote');
  if (!Array.isArray(q.tags) || !q.tags.length) err(id, 'tags must be a non-empty array');

  // --- duplicate detection ------------------------------------------------
  // The key is the whole prompt the candidate sees, because scenario questions
  // deliberately share a short stem but differ entirely in their setup.
  const key = normalise(`${q.question} ${q.scenario || ''}`);
  if (seenQuestionText.has(key)) {
    err(id, `question and scenario duplicate ${seenQuestionText.get(key)}`);
  } else {
    seenQuestionText.set(key, q.id);
  }

  // --- anti-pattern: option length parity ---------------------------------
  const texts = q.options.map((o) => String(o.text));
  const stats = lengthStats(texts);
  const allShort = stats.max < 25;
  if (!allShort) {
    diffPercentSum += stats.diffPercent;
    if (stats.diffPercent > diffPercentMax) {
      diffPercentMax = stats.diffPercent;
      diffPercentMaxId = q.id;
    }
    if (stats.diffPercent > 15) {
      flaggedForLength.push({ id: q.id, diffPercent: Math.round(stats.diffPercent * 10) / 10 });
      warn(id, `option length spread ${stats.diffPercent.toFixed(1)}% exceeds the 15% target (lengths ${stats.lens.join('/')})`);
    }
    const words = texts.map(wordCount);
    const wMean = words.reduce((a, b) => a + b, 0) / words.length;
    const wSpread = wMean ? ((Math.max(...words) - Math.min(...words)) / wMean) * 100 : 0;
    if (wSpread > 40) warn(id, `word-count spread ${wSpread.toFixed(0)}% (words ${words.join('/')})`);

    const sentences = texts.map(sentenceCount);
    if (new Set(sentences).size > 1 && Math.max(...sentences) - Math.min(...sentences) > 1) {
      warn(id, `sentence counts differ markedly (${sentences.join('/')})`);
    }
  } else {
    parityExempt += 1;
  }

  // --- anti-pattern: the correct option standing out -----------------------
  const correctIdx = q.options.findIndex((o) => o.id === q.correctOptionId);
  if (correctIdx >= 0 && !allShort) {
    const len = texts[correctIdx].length;
    const othersMax = Math.max(...texts.filter((_, i) => i !== correctIdx).map((t) => t.length));
    const othersMin = Math.min(...texts.filter((_, i) => i !== correctIdx).map((t) => t.length));
    if (len > othersMax) correctIsLongest += 1;
    if (len < othersMin) correctIsShortest += 1;

    const withQualifier = texts.map((t) => containsAny(t, QUALIFIERS));
    if (withQualifier[correctIdx] && withQualifier.filter(Boolean).length === 1) {
      warn(id, 'the correct option is the only one carrying a qualifier (unless/except/if/when)');
    }
    const withNumber = texts.map((t) => /\d/.test(t));
    if (withNumber[correctIdx] && withNumber.filter(Boolean).length === 1) {
      warn(id, 'the correct option is the only one containing a number');
    }
    const absolutes = texts.map((t) => containsAny(t, ABSOLUTES));
    if (absolutes.filter(Boolean).length === 3 && !absolutes[correctIdx]) {
      warn(id, 'all three distractors carry an absolute word and the correct option does not');
    }
  }
});

// ---------------------------------------------------------------------------
// bank-level checks
// ---------------------------------------------------------------------------

const bankLevel = {};
if (!topicFilter) {
  if (QUESTIONS.length < 250) err('BANK', `only ${QUESTIONS.length} questions; at least 250 are required`);

  TOPICS.forEach((t) => {
    const count = QUESTIONS.filter((q) => q.topic === t.key).length;
    if (count < t.target) err('BANK', `topic ${t.key}: ${count}/${t.target} questions`);
    if (count > t.target) warn('BANK', `topic ${t.key} has ${count} questions, above its target of ${t.target}`);
  });

  // Answer-position distribution
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  QUESTIONS.forEach((q) => { if (counts[q.correctOptionId] !== undefined) counts[q.correctOptionId] += 1; });
  const values = Object.values(counts);
  const spread = Math.max(...values) - Math.min(...values);
  if (spread > 4) err('BANK', `correct-answer letters are unbalanced: ${JSON.stringify(counts)}`);

  // Run length and cycle detection over id order
  const ordered = QUESTIONS.slice().sort((a, b) => questionIdNumber(a.id) - questionIdNumber(b.id));
  let run = 1;
  let maxRun = 1;
  for (let i = 1; i < ordered.length; i += 1) {
    run = ordered[i].correctOptionId === ordered[i - 1].correctOptionId ? run + 1 : 1;
    if (run > maxRun) maxRun = run;
  }
  if (maxRun > 3) err('BANK', `correct answer repeats ${maxRun} times consecutively`);

  let cycleRun = 0;
  let maxCycle = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = OPTION_IDS.indexOf(ordered[i - 1].correctOptionId);
    const cur = OPTION_IDS.indexOf(ordered[i].correctOptionId);
    cycleRun = cur === (prev + 1) % 4 ? cycleRun + 1 : 0;
    if (cycleRun > maxCycle) maxCycle = cycleRun;
  }
  if (maxCycle >= 8) err('BANK', `a repeating A-B-C-D cycle runs for ${maxCycle + 1} questions`);

  const measured = QUESTIONS.length - parityExempt;
  bankLevel.letterCounts = counts;
  bankLevel.maxConsecutiveRun = maxRun;
  bankLevel.longestAbcdCycle = maxCycle + 1;
  bankLevel.correctIsLongestPercent = QUESTIONS.length ? round1((correctIsLongest / QUESTIONS.length) * 100) : 0;
  bankLevel.correctIsShortestPercent = QUESTIONS.length ? round1((correctIsShortest / QUESTIONS.length) * 100) : 0;
  bankLevel.meanLengthSpreadPercent = measured ? round1(diffPercentSum / measured) : 0;
  bankLevel.maxLengthSpreadPercent = round1(diffPercentMax);
  bankLevel.maxLengthSpreadId = diffPercentMaxId;
  bankLevel.flaggedForLength = flaggedForLength.length;
  bankLevel.parityExemptShortOptions = parityExempt;

  if (bankLevel.correctIsLongestPercent > 35) {
    err('BANK', `the correct answer is the longest option in ${bankLevel.correctIsLongestPercent}% of questions (expected around 25%)`);
  }
  if (bankLevel.correctIsShortestPercent > 35) {
    err('BANK', `the correct answer is the shortest option in ${bankLevel.correctIsShortestPercent}% of questions (expected around 25%)`);
  }

  // Absolute-word correlation with incorrectness, bank-wide.
  let absInCorrect = 0;
  let absInDistractor = 0;
  QUESTIONS.forEach((q) => {
    q.options.forEach((o) => {
      if (!containsAny(o.text, ABSOLUTES)) return;
      if (o.id === q.correctOptionId) absInCorrect += 1; else absInDistractor += 1;
    });
  });
  const absTotal = absInCorrect + absInDistractor;
  bankLevel.absoluteWordsInCorrectOptions = absInCorrect;
  bankLevel.absoluteWordsInDistractors = absInDistractor;
  if (absTotal >= 20 && absInCorrect / absTotal < 0.1) {
    warn('BANK', `absolute words appear in distractors ${absInDistractor} times but in correct options only ${absInCorrect} times - this is itself a tell`);
  }
}

// ---------------------------------------------------------------------------
// shuffle integrity
// ---------------------------------------------------------------------------

let shuffleChecks = 0;
if (bank.length) {
  const rng = createRng(4242);
  const iterations = 1000;
  for (let i = 0; i < iterations; i += 1) {
    const q = bank[i % bank.length];
    const order = shuffle(q.options.map((o) => o.id), rng);
    if (order.length !== 4 || new Set(order).size !== 4) {
      err(q.id, 'shuffle produced a malformed option order');
      break;
    }
    const displayed = order.map((oid) => q.options.find((o) => o.id === oid));
    if (displayed.some((o) => !o)) { err(q.id, 'shuffle lost an option'); break; }
    const correct = displayed.find((o) => o.id === q.correctOptionId);
    const source = q.options.find((o) => o.id === q.correctOptionId);
    if (!correct || correct.text !== source.text || correct.explanation !== source.explanation) {
      err(q.id, 'shuffle broke the binding between the correct option, its text and its explanation');
      break;
    }
    shuffleChecks += 1;
  }
}

// ---------------------------------------------------------------------------
// output
// ---------------------------------------------------------------------------

function round1(x) { return Math.round(x * 10) / 10; }

const summary = {
  scope: topicFilter || 'whole bank',
  questionsChecked: bank.length,
  totalInBank: QUESTIONS.length,
  errors: errors.length,
  warnings: warnings.length,
  shuffleIterations: shuffleChecks,
  ...bankLevel,
};

if (asJson) {
  console.log(JSON.stringify({ summary, errors, warnings }, null, 2));
} else {
  console.log(`\nValidating ${summary.scope}: ${bank.length} question(s)\n`);
  if (errors.length) {
    console.log(`ERRORS (${errors.length})`);
    errors.forEach((e) => console.log(`  [${e.id}] ${e.msg}`));
    console.log('');
  }
  if (warnings.length) {
    console.log(`WARNINGS (${warnings.length})`);
    warnings.forEach((w) => console.log(`  [${w.id}] ${w.msg}`));
    console.log('');
  }
  Object.entries(summary).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(30)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  });
  console.log('');
  console.log(errors.length === 0 && (warningsOk || warnings.length === 0) ? 'PASS' : 'FAIL');
}

const failed = errors.length > 0 || (!warningsOk && warnings.length > 0);
process.exit(failed ? 1 : 0);
