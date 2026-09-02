/**
 * Deterministic PRNG for the browser counterfactual: xoshiro128** seeded from
 * a string. Integer-only arithmetic, so every engine produces the same stream.
 */

export interface Prng {
  /** Next 32-bit unsigned integer. */
  nextUint32(): number;
  /** Uniform in [0, 1) with 53 random bits. */
  uniform53(): number;
  /** Fill out[0 .. count) with the next `count` values of uniform53(); same sequence, no per-call overhead. */
  fillUniform53(out: Float64Array, count: number): void;
}

export const SEED_MATERIAL_TAG = 'counterfactual-cost-draws-v1';

/** Mirrors the role of Python's SHA-256(master_seed|greedy-cost-draws-v1|job_id): one stream per (seed, round). */
export function seedMaterial(seed: number, round: number): string {
  return `${seed}|${SEED_MATERIAL_TAG}|round-${round}`;
}

/** 32-bit FNV-1a over the code units of text (all inputs are ASCII). */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** splitmix32: expands one 32-bit seed into well-mixed 32-bit words. */
export function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let t = state ^ (state >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

export function createPrng(material: string): Prng {
  const mix = splitmix32(fnv1a32(material));
  let s0 = mix();
  let s1 = mix();
  let s2 = mix();
  let s3 = mix();
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1; // xoshiro must not start from the all-zero state

  const nextUint32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  };

  const uniform53 = (): number => ((nextUint32() >>> 5) * 67108864 + (nextUint32() >>> 6)) / 9007199254740992;

  const fillUniform53 = (out: Float64Array, count: number): void => {
    let a = s0;
    let b = s1;
    let c = s2;
    let d = s3;
    for (let i = 0; i < count; i += 1) {
      const high = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
      let t = b << 9;
      c ^= a;
      d ^= b;
      b ^= c;
      a ^= d;
      c ^= t;
      d = rotl(d, 11);
      const low = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
      t = b << 9;
      c ^= a;
      d ^= b;
      b ^= c;
      a ^= d;
      c ^= t;
      d = rotl(d, 11);
      out[i] = ((high >>> 5) * 67108864 + (low >>> 6)) / 9007199254740992;
    }
    s0 = a;
    s1 = b;
    s2 = c;
    s3 = d;
  };

  return { nextUint32, uniform53, fillUniform53 };
}
