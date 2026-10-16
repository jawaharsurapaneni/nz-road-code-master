// Builds the single standalone deliverable: nz-road-code-master.html
//
// The source is written as ordinary ES modules so Node can unit-test exactly
// the code that ships. The build strips the import statements and the `export`
// keywords and concatenates the modules, in dependency order, into one IIFE.
// Nothing is fetched at runtime: CSS, JavaScript, the question bank and every
// SVG are inlined.
//
//   node tools/build.mjs [--out <path>]

import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = join(root, 'src');

const args = process.argv.slice(2);
const outPath = args.includes('--out')
  ? resolve(args[args.indexOf('--out') + 1])
  : join(root, 'nz-road-code-master.html');

// Dependency order matters: concatenation replaces the module graph.
const MODULE_ORDER = [
  'core/schema.js',
  'core/rng.js',
  'core/rulesets.js',
  'core/theme.js',
  'core/storage.js',
  'core/stats.js',
  'core/exam.js',
  'core/portability.js',
  'questions/01-signs.js',
  'questions/02-intersections.js',
  'questions/03-speed.js',
  'questions/04-markings.js',
  'questions/05-following.js',
  'questions/06-parking.js',
  'questions/07-overtaking.js',
  'questions/08-vulnerable.js',
  'questions/09-special.js',
  'questions/10-impairment.js',
  'questions/11-restraints.js',
  'questions/12-vehicle.js',
  'questions/13-weather.js',
  'questions/14-rural.js',
  'questions/15-restricted.js',
  'questions/16-scenarios.js',
  'questions/index.js',
  'ui/dom.js',
  'ui/svg.js',
  'ui/views.js',
  'ui/app.js',
];

const IMPORT_RE = /^[ \t]*import\s+[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*\r?\n/gm;
const BARE_IMPORT_RE = /^[ \t]*import\s+['"][^'"]+['"];?[ \t]*\r?\n/gm;
const EXPORT_RE = /^[ \t]*export\s+(?=(const|let|var|function|class|async)\b)/gm;

function readModule(rel) {
  const text = readFileSync(join(src, rel), 'utf8');
  if (/^\s*export\s+default\b/m.test(text)) {
    throw new Error(`${rel}: default exports are not supported by the inlining build`);
  }
  if (/^\s*export\s*\{/m.test(text)) {
    throw new Error(`${rel}: re-export blocks are not supported by the inlining build`);
  }
  return text
    .replace(IMPORT_RE, '')
    .replace(BARE_IMPORT_RE, '')
    .replace(EXPORT_RE, '');
}

// Guard against two modules declaring the same top-level name: harmless while
// they are separate modules, fatal once they share one scope.
function topLevelNames(code, rel, seen, problems) {
  const re = /^(?:const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm;
  let m = re.exec(code);
  while (m) {
    const name = m[1];
    if (seen.has(name)) problems.push(`${name} is declared in both ${seen.get(name)} and ${rel}`);
    else seen.set(name, rel);
    m = re.exec(code);
  }
}

const seen = new Map();
const problems = [];
const parts = [];

MODULE_ORDER.forEach((rel) => {
  const code = readModule(rel);
  topLevelNames(code, rel, seen, problems);
  parts.push(`/* ===== ${rel} ===== */\n${code.trim()}\n`);
});

if (problems.length) {
  console.error('Duplicate top-level declarations would collide once inlined:');
  problems.forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}

const bundle = `(function () {\n'use strict';\n\n${parts.join('\n')}\n})();\n`;

// A literal </script> anywhere in the bundle (including inside a question's
// text) would terminate the script element early.
const safeBundle = bundle.replace(/<\/script/gi, '<\\/script');

// ---------------------------------------------------------------------------
// fonts
// ---------------------------------------------------------------------------
//
// One family, embedded as base64 woff2 rather than linked, because the app has
// to work from file:// with no network at all. Inter is SIL OFL, which permits
// embedding; see src/fonts/LICENSE.md.

const FONT_FACES = [
  { file: 'Inter-variable.woff2', family: 'Inter', style: 'normal', weight: '400 600' },
];

let fontBytes = 0;
const fontCss = FONT_FACES.map((f) => {
  const buf = readFileSync(join(src, 'fonts', f.file));
  fontBytes += buf.length;
  return `@font-face {\n`
    + `  font-family: '${f.family}';\n`
    + `  font-style: ${f.style};\n`
    + `  font-weight: ${f.weight};\n`
    + `  font-display: swap;\n`
    + `  src: url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');\n`
    + `}`;
}).join('\n');

const css = `${fontCss}\n\n${readFileSync(join(src, 'styles.css'), 'utf8')}`;
const template = readFileSync(join(src, 'index.html'), 'utf8');

const buildDate = new Date().toISOString().slice(0, 10);

let html = template
  .replace('<!--INJECT:STYLES-->', `<style>\n${css}\n</style>`)
  .replace('<!--INJECT:SCRIPT-->', `<script>\n${safeBundle}\n</script>`)
  .replace(/<!--INJECT:BUILD_DATE-->/g, buildDate);

// ---------------------------------------------------------------------------
// safety assertions
// ---------------------------------------------------------------------------

const failures = [];

if (html.includes('<!--INJECT:')) failures.push('an INJECT marker was left unreplaced');
if (/\beval\s*\(/.test(html)) failures.push('output contains eval(');
if (/new\s+Function\s*\(/.test(html)) failures.push('output contains new Function(');
if (/\bdocument\.write\s*\(/.test(html)) failures.push('output contains document.write(');

// No network dependency: nothing may be loaded from a remote host. Links in
// prose (href on <a>) are fine - those are the official sources - but src,
// stylesheet hrefs and @import are not.
const remoteSrc = html.match(/\s(?:src|data-src)\s*=\s*["']https?:\/\/[^"']+["']/gi) || [];
if (remoteSrc.length) failures.push(`output loads remote resources: ${remoteSrc.slice(0, 3).join(', ')}`);
const remoteStylesheet = html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || [];
if (remoteStylesheet.length) failures.push('output links an external stylesheet');
if (/@import\s+url\(/i.test(html)) failures.push('CSS @import would require the network');
const scriptSrc = html.match(/<script[^>]+\ssrc\s*=/gi) || [];
if (scriptSrc.length) failures.push('output references an external script file');

if (failures.length) {
  console.error('Build safety checks failed:');
  failures.forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}

// --out may point into a directory that does not exist yet, which is how the
// Vercel build writes straight into public/.
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
const bytes = statSync(outPath).size;

console.log(`Built ${outPath}`);
console.log(`  modules inlined   ${MODULE_ORDER.length}`);
console.log(`  fonts embedded    ${FONT_FACES.length} faces, ${(fontBytes / 1024).toFixed(0)} KB raw`);
console.log(`  size              ${(bytes / 1024 / 1024).toFixed(2)} MB (${bytes.toLocaleString('en-NZ')} bytes)`);
console.log(`  build date        ${buildDate}`);
console.log('  safety checks     no eval, no new Function, no document.write, no remote resources');
