// mulberry32 — small, fast, deterministic 32-bit PRNG. Good enough for demo data.
export function makeRng (seed) {
  let a = seed >>> 0
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const out = arr.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    weighted: (pairs) => { // pairs: [[item, weight], ...]
      const total = pairs.reduce((s, [, w]) => s + w, 0)
      let x = next() * total
      for (const [item, w] of pairs) { if ((x -= w) < 0) return item }
      return pairs[pairs.length - 1][0]
    },
    bool: (p = 0.5) => next() < p,
  }
}
