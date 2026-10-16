// Generates tools/letter-plan.json: the intended correct-option letter for
// every question id in the bank.
//
// Why a plan rather than ad-hoc choices while authoring: section 6.3 of the
// brief requires the correct answer to be spread evenly across A/B/C/D with no
// long runs and no repeating cycle. Deciding the letters up front, from a
// seeded shuffle of each block of four, makes that guaranteed and auditable
// instead of something to retro-fit over 275 hand-written questions.
//
// Run: node tools/letter-plan.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TOPICS, formatQuestionId, OPTION_IDS } from '../src/core/schema.js';
import { createRng, shuffle } from '../src/core/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const SEED = 20261014;

const lastId = TOPICS[TOPICS.length - 1].idTo;
const rng = createRng(SEED);

const letters = [];
while (letters.length < lastId) {
  shuffle(OPTION_IDS, rng).forEach((l) => letters.push(l));
}
letters.length = lastId;

const plan = {};
for (let n = 1; n <= lastId; n += 1) plan[formatQuestionId(n)] = letters[n - 1];

// Self-check: the plan must satisfy the rules it exists to guarantee.
const counts = { A: 0, B: 0, C: 0, D: 0 };
letters.forEach((l) => { counts[l] += 1; });
let maxRun = 1;
let run = 1;
for (let i = 1; i < letters.length; i += 1) {
  run = letters[i] === letters[i - 1] ? run + 1 : 1;
  if (run > maxRun) maxRun = run;
}
const spread = Math.max(...Object.values(counts)) - Math.min(...Object.values(counts));
if (maxRun > 3) throw new Error(`letter plan has a run of ${maxRun}`);
if (spread > 2) throw new Error(`letter plan is unbalanced: spread ${spread}`);

const out = {
  generatedBy: 'tools/letter-plan.mjs',
  seed: SEED,
  totalQuestions: lastId,
  counts,
  maxConsecutiveRun: maxRun,
  plan,
};

const target = join(here, 'letter-plan.json');
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${target}`);
console.log(`  ${lastId} ids  A:${counts.A} B:${counts.B} C:${counts.C} D:${counts.D}  max run ${maxRun}`);

// Print the plan grouped by topic so it can be read while authoring a batch.
TOPICS.forEach((t) => {
  const seq = [];
  for (let n = t.idFrom; n <= t.idTo; n += 1) seq.push(`${String(n).padStart(3, '0')}:${plan[formatQuestionId(n)]}`);
  console.log(`  ${t.key.padEnd(14)} ${seq.join(' ')}`);
});
