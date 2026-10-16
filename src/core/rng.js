// Seeded pseudo-random number generation. Seeding keeps exam construction and
// option shuffling reproducible, which is what makes the shuffle-integrity
// tests meaningful rather than flaky.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// mulberry32 - small, fast, good enough statistical quality for shuffling.
export function createRng(seed) {
  let a = (typeof seed === 'number' ? seed : hashString(seed)) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  // Not security-sensitive; only used to vary exam order between sessions.
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

// Fisher-Yates on a copy. Never mutates the input array.
export function shuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function sample(items, count, rng) {
  if (count >= items.length) return shuffle(items, rng);
  return shuffle(items, rng).slice(0, count);
}

export function pick(items, rng) {
  return items[Math.floor(rng() * items.length)];
}
