// Smoke test for the built standalone file.
//
// Extracts the inlined script from nz-road-code-master.html and executes it in
// a sandboxed VM with a minimal document stub. This does NOT exercise the DOM
// or the user interface - that is only verifiable in a real browser - but it
// does prove that the concatenated bundle initialises: module order is valid,
// there are no temporal-dead-zone or undefined-identifier errors at load time,
// the diagram registry builds, and the question bank freezes.
//
//   node tools/test-bundle.mjs

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const htmlPath = join(root, 'nz-road-code-master.html');

let passed = 0;
let failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; } catch (e) { failed += 1; failures.push({ name, message: e.message }); }
}

const html = readFileSync(htmlPath, 'utf8');

test('the built file exists and is a complete HTML document', () => {
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'missing doctype');
  assert.ok(html.includes('</html>'), 'missing closing html tag');
  assert.ok(statSync(htmlPath).size > 100000, 'file is suspiciously small');
});

test('the built file inlines its stylesheet and script', () => {
  assert.ok(/<style>[\s\S]{1000,}<\/style>/.test(html), 'no inline stylesheet of any size');
  assert.ok(/<script>[\s\S]{10000,}<\/script>/.test(html), 'no inline script of any size');
});

test('the built file has no unreplaced build markers', () => {
  assert.ok(!html.includes('<!--INJECT:'), 'an INJECT marker survived the build');
});

test('the built file loads nothing from the network', () => {
  assert.equal((html.match(/\ssrc\s*=\s*["']https?:/gi) || []).length, 0, 'remote src attribute');
  assert.equal((html.match(/<link[^>]+rel=["']stylesheet["']/gi) || []).length, 0, 'external stylesheet');
  assert.equal((html.match(/@import\s+url\(/gi) || []).length, 0, 'css @import');
});

test('the typeface is embedded, not fetched', () => {
  const faces = html.match(/@font-face\s*\{[\s\S]*?\}/g) || [];
  assert.equal(faces.length, 1, `expected 1 @font-face rule, saw ${faces.length}`);
  assert.ok(
    /src:\s*url\(data:font\/woff2;base64,[A-Za-z0-9+/=]{1000,}\)/.test(faces[0]),
    'the @font-face does not carry an embedded base64 woff2',
  );
  assert.ok(html.includes("'Inter'"), 'the body face is not declared');
});

test('the app sets one plain sans throughout, with a standard fallback', () => {
  // A practice test should not be set in a display face, and must still be
  // readable if the embedded font fails to load.
  assert.ok(!/Instrument Serif/.test(html), 'a display serif is still referenced');
  assert.ok(!/var\(--serif\)/.test(html), 'a --serif token is still in use');
  const stack = (html.match(/--sans:\s*([^;]+);/) || [])[1] || '';
  ['Inter', 'system-ui', 'Arial', 'sans-serif'].forEach((f) => {
    assert.ok(stack.includes(f), `the font stack is missing ${f}`);
  });
});

test('no font is requested over the network', () => {
  ['fonts.googleapis.com', 'fonts.gstatic.com', '@import'].forEach((needle) => {
    assert.ok(!html.includes(needle), `the build references ${needle}`);
  });
  assert.ok(!/<link[^>]+href=["']https?:/i.test(html), 'a remote <link> survived the build');
});

test('the built file contains no dynamic code execution', () => {
  assert.ok(!/\beval\s*\(/.test(html), 'eval( present');
  assert.ok(!/new\s+Function\s*\(/.test(html), 'new Function( present');
  assert.ok(!/\bdocument\.write\s*\(/.test(html), 'document.write( present');
  assert.ok(!/\.innerHTML\s*=/.test(html), 'innerHTML assignment present');
});

// ---------------------------------------------------------------------------
// execute the bundle
// ---------------------------------------------------------------------------

const match = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
if (!match) {
  console.error('Could not find the inlined script block.');
  process.exit(1);
}
const code = match[1].replace(/<\\\/script/g, '</script');

// Minimal stub. readyState stays 'loading' so the bundle registers its
// DOMContentLoaded listener and returns without touching the DOM.
let domContentLoadedRegistered = false;
const sandbox = {
  console,
  Math,
  JSON,
  Date,
  Set,
  Map,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Error,
  RegExp,
  Promise,
  document: {
    readyState: 'loading',
    addEventListener(type) { if (type === 'DOMContentLoaded') domContentLoadedRegistered = true; },
    getElementById() { return null; },
    querySelector() { return null; },
    createElement() { throw new Error('createElement should not be called at load time'); },
  },
  window: {
    addEventListener() {},
    localStorage: null,
    setInterval() { return 0; },
    clearInterval() {},
    setTimeout() { return 0; },
    scrollTo() {},
  },
};
sandbox.globalThis = sandbox;

test('the bundle executes to completion without throwing', () => {
  vm.createContext(sandbox);
  const script = new vm.Script(code, { filename: 'nz-road-code-master.html' });
  script.runInContext(sandbox, { timeout: 15000 });
});

test('the bundle defers startup until the document is ready', () => {
  assert.equal(domContentLoadedRegistered, true, 'no DOMContentLoaded listener was registered');
});

// Re-run with a window that has no localStorage at all, to confirm the storage
// fallback path does not throw during module initialisation.
test('the bundle initialises when localStorage is absent', () => {
  const s2 = { ...sandbox, document: { ...sandbox.document, addEventListener() {} } };
  s2.globalThis = s2;
  vm.createContext(s2);
  new vm.Script(code, { filename: 'bundle-no-storage' }).runInContext(s2, { timeout: 15000 });
});

console.log('');
if (failures.length) {
  console.log(`FAILURES (${failures.length})`);
  failures.forEach((f) => console.log(`  x ${f.name}\n      ${f.message.split('\n')[0]}`));
  console.log('');
}
console.log(`${passed} passed, ${failed} failed  (${(statSync(htmlPath).size / 1024 / 1024).toFixed(2)} MB bundle)`);
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
