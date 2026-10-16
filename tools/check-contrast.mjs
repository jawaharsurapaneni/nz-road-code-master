// WCAG contrast gate for the colour themes.
//
// Reads the custom properties out of src/styles.css and checks every
// foreground/background pair the app actually puts on screen, in BOTH the
// light and the dark theme. Colour values are never hard-coded here: they are
// resolved from the stylesheet, so this fails the moment a token is changed to
// something unreadable in either theme.
//
//   node tools/check-contrast.mjs
//   node tools/check-contrast.mjs --verbose
//   node tools/check-contrast.mjs --theme dark

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8');
const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const onlyTheme = argv.includes('--theme') ? argv[argv.indexOf('--theme') + 1] : null;

// --- resolve tokens per theme ----------------------------------------------

function readBlock(label, pattern) {
  const m = pattern.exec(css);
  if (!m) {
    console.error(`Could not find the ${label} token block in src/styles.css`);
    process.exit(2);
  }
  const out = {};
  m[1].replace(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi, (_, name, value) => {
    out[name] = value.trim();
    return '';
  });
  return out;
}

// The light theme is the :root baseline. The dark theme overrides a subset of
// it, so dark tokens are layered on top of light exactly as the cascade does.
const lightTokens = readBlock(':root', /:root\s*\{([\s\S]*?)\n\}/);
const darkOverrides = readBlock(':root[data-theme="dark"]', /:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
const darkTokens = { ...lightTokens, ...darkOverrides };

// The media-query fallback must stay in step with the explicit dark block,
// otherwise someone browsing with a dark OS gets a half-updated palette in the
// moment before the app boots.
const mediaFallback = readBlock(
  '@media (prefers-color-scheme: dark)',
  /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme\]\)\s*\{([\s\S]*?)\n  \}/,
);

const THEMES = [
  { name: 'light', tokens: lightTokens },
  { name: 'dark', tokens: darkTokens },
].filter((t) => !onlyTheme || t.name === onlyTheme);

function hexOf(tokens, nameOrHex) {
  const v = nameOrHex.startsWith('--') ? tokens[nameOrHex.slice(2)] : nameOrHex;
  if (!v) throw new Error(`unknown token ${nameOrHex}`);
  const m = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(v);
  if (!m) throw new Error(`token ${nameOrHex} is not a plain hex colour: ${v}`);
  const h = m[1];
  return h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
}

// --- contrast maths (WCAG 2.1) ---------------------------------------------

function luminance(hex) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(tokens, fg, bg) {
  const a = luminance(hexOf(tokens, fg));
  const b = luminance(hexOf(tokens, bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// --- the pairs the app actually renders ------------------------------------
//
// min 4.5 = WCAG AA for body-sized text.
// min 3.0 = AA for large text (>=24px, or >=19px bold) and for the boundary of
//           a user interface component such as a button border or focus ring.

const PAIRS = [
  // page and card text
  ['body text on the page', '--ink', '--bg', 4.5],
  ['body text on a card', '--ink', '--surface', 4.5],
  ['soft text on a card', '--ink-soft', '--surface', 4.5],
  ['soft text on the page', '--ink-soft', '--bg', 4.5],
  ['muted text on a card', '--ink-faint', '--surface', 4.5],
  ['muted text on the page', '--ink-faint', '--bg', 4.5],
  ['muted text on an alt panel', '--ink-faint', '--surface-alt', 4.5],
  ['stat text on an alt panel', '--ink', '--surface-alt', 4.5],

  // header, nav and footer chrome
  ['brand text on the header', '--on-navy', '--navy', 4.5],
  ['brand subtitle on the header', '--on-navy-soft', '--navy', 4.5],
  ['nav label on the header', '--on-navy', '--navy', 4.5],
  ['current nav item on the header', '--on-navy', '--navy', 4.5],
  ['theme toggle label on the header', '--on-navy', '--navy', 4.5],
  ['ruleset bar text', '--ink-soft', '--surface-alt', 4.5],
  ['ruleset bar emphasis', '--ink', '--surface-alt', 4.5],
  ['footer text on the footer', '--on-navy', '--navy-deep', 4.5],
  ['footer muted text', '--on-navy-soft', '--navy-deep', 4.5],
  ['footer link on the footer', '--on-navy', '--navy-deep', 4.5],
  ['skip link label', '--on-navy', '--skip-bg', 4.5],

  // buttons and links
  ['primary button label', '--on-info', '--info', 4.5],
  ['primary button label on hover', '--on-info', '--info-dark', 4.5],
  ['secondary button label', '--ink', '--surface', 4.5],
  ['danger button label', '--regulatory-dark', '--surface', 4.5],
  ['danger button label on hover', '--regulatory-dark', '--incorrect-bg', 4.5],
  ['danger button border against a card', '--regulatory', '--surface', 3],
  ['ghost button label', '--info', '--surface', 4.5],
  ['ghost button label on hover', '--info', '--info-soft', 4.5],
  ['link colour on a card', '--info', '--surface', 4.5],
  ['button border against the page', '--line-strong', '--bg', 3],
  ['focus ring against a card', '--info', '--surface', 3],
  ['focus ring against the header', '--on-navy', '--navy', 3],

  // answer options
  ['option text on a card', '--ink', '--surface', 4.5],
  ['option text when selected', '--ink', '--selected-bg', 4.5],
  ['option text when correct', '--ink', '--correct-bg', 4.5],
  ['option text when incorrect', '--ink', '--incorrect-bg', 4.5],
  ['correct marker label', '--correct', '--correct-bg', 4.5],
  ['incorrect marker label', '--incorrect', '--incorrect-bg', 4.5],
  ['correct letter badge', '--on-correct', '--correct', 4.5],
  ['incorrect letter badge', '--on-incorrect', '--incorrect', 4.5],
  ['selected letter badge', '--on-info', '--info', 4.5],
  ['unselected letter badge', '--ink-soft', '--surface-alt', 4.5],
  ['correct border against a card', '--correct', '--surface', 3],
  ['incorrect border against a card', '--incorrect', '--surface', 3],

  // verdicts, pills and callouts
  ['correct verdict text', '--correct', '--surface', 4.5],
  ['incorrect verdict text', '--incorrect', '--surface', 4.5],
  ['topic pill text', '--info', '--info-soft', 4.5],
  ['beginner pill text', '--correct', '--correct-bg', 4.5],
  ['intermediate pill text', '--warning-ink', '--warning-bg', 4.5],
  ['advanced pill text', '--incorrect', '--incorrect-bg', 4.5],
  ['unverified pill text', '--warning-ink', '--warning-bg', 4.5],
  ['independent-tool pill text', '--warning-ink', '--warning-bg', 4.5],
  ['independent-tool pill border', '--warning-border', '--surface-alt', 3],
  ['warning callout text', '--warning-ink', '--warning-bg', 4.5],
  ['info callout text', '--ink', '--info-soft', 4.5],
  ['danger callout text', '--ink', '--incorrect-bg', 4.5],
  ['ok callout text', '--ink', '--correct-bg', 4.5],

  // dashboard primary action and readiness
  ['next step eyebrow', '--ink-faint', '--bg', 4.5],
  ['next step title', '--ink', '--bg', 4.5],
  ['next step reason', '--ink-soft', '--bg', 4.5],
  ['readiness, tracking well', '--correct', '--bg', 4.5],
  ['readiness, more practice needed', '--warning-ink', '--bg', 4.5],
  ['readiness, not enough data', '--ink-faint', '--bg', 4.5],

  // results, timer and toasts
  ['pass verdict text', '--correct', '--surface', 4.5],
  ['fail verdict text', '--incorrect', '--surface', 4.5],
  ['timer text', '--ink', '--surface-alt', 4.5],
  ['low timer text', '--incorrect', '--incorrect-bg', 4.5],
  ['toast text', '--toast-ink', '--toast-bg', 4.5],
  ['warning toast text', '--toast-ink', '--toast-warn-bg', 4.5],
  ['error toast text', '--toast-ink', '--toast-error-bg', 4.5],
  ['progress bar against its track', '--accent', '--surface-alt', 3],
  ['table rule against a card', '--line', '--surface', 1.2],
];

// --- run -------------------------------------------------------------------

const rows = [];
THEMES.forEach(({ name, tokens }) => {
  PAIRS.forEach(([pair, fg, bg, min]) => {
    const r = ratio(tokens, fg, bg);
    rows.push({ theme: name, name: pair, fg, bg, min, ratio: r, ok: r >= min });
  });
});

const failed = rows.filter((r) => !r.ok);

// The media fallback must declare the same values as the explicit dark block
// for every token that block overrides.
const drifted = Object.keys(darkOverrides).filter((k) => mediaFallback[k] !== darkOverrides[k]);

if (verbose || failed.length) {
  let currentTheme = null;
  rows.forEach((r) => {
    if (!verbose && r.ok) return;
    if (r.theme !== currentTheme) {
      currentTheme = r.theme;
      console.log(`\n  ${currentTheme} theme`);
    }
    const flag = r.ok ? 'ok  ' : 'FAIL';
    console.log(`    ${flag} ${r.ratio.toFixed(2).padStart(5)}:1 (min ${r.min})  ${r.name}`
      + `  [${r.fg} on ${r.bg}]`);
  });
  console.log('');
}

if (drifted.length) {
  console.log('The prefers-color-scheme fallback has drifted from the dark theme block:');
  drifted.forEach((k) => {
    console.log(`  --${k}: fallback ${mediaFallback[k] || '(missing)'} vs dark ${darkOverrides[k]}`);
  });
  console.log('');
}

console.log(`${rows.length - failed.length} passed, ${failed.length} failed  `
  + `(${PAIRS.length} pairs x ${THEMES.length} theme${THEMES.length === 1 ? '' : 's'})`);

THEMES.forEach(({ name }) => {
  const themeRows = rows.filter((r) => r.theme === name && r.min >= 4.5);
  if (!themeRows.length) return;
  const worst = themeRows.reduce((a, b) => (a.ratio < b.ratio ? a : b));
  console.log(`  lowest text contrast (${name}) ${worst.ratio.toFixed(2)}:1 — ${worst.name}`);
});
console.log(`  fallback tokens in sync        ${drifted.length === 0 ? 'yes' : `NO (${drifted.length} drifted)`}`);

const bad = failed.length > 0 || drifted.length > 0;
console.log(bad ? 'FAIL' : 'PASS');
process.exit(bad ? 1 : 0);
