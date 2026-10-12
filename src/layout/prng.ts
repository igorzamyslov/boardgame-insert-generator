/**
 * Seeded PRNG for the layout engine: xoshiro128** (Blackman & Vigna), state seeded
 * with splitmix32. Pure 32-bit integer arithmetic (Math.imul, shifts, xor), so the
 * sequence is identical on every JS engine. Math.random is banned in layout/.
 */
export type RngState = [number, number, number, number];

export interface Rng {
  /** Next raw 32-bit output as an unsigned integer. */
  nextU32(): number;
  /** Uniform integer in [0, n). n must be an integer in [1, 2^32]. Unbiased (rejection). */
  nextInt(n: number): number;
  /** Uniform float in [0, 1): nextU32() / 2^32, exact in a double. */
  nextFloat(): number;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Copy of the internal state. */
  state(): RngState;
}

const TWO_32 = 4294967296;

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** splitmix32: a 32-bit seed → a stream of well-mixed 32-bit words (unsigned). */
export function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

export function createRngFromState(initial: Readonly<RngState>): Rng {
  let s0 = initial[0] | 0;
  let s1 = initial[1] | 0;
  let s2 = initial[2] | 0;
  let s3 = initial[3] | 0;
  if ((s0 | s1 | s2 | s3) === 0) {
    throw new RangeError("xoshiro128** state must not be all zero");
  }
  const nextU32 = (): number => {
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
  const nextInt = (n: number): number => {
    if (!Number.isInteger(n) || n < 1 || n > TWO_32) {
      throw new RangeError(`nextInt: n must be an integer in [1, 2^32], got ${n}`);
    }
    const limit = TWO_32 - (TWO_32 % n);
    let x = nextU32();
    while (x >= limit) {
      x = nextU32();
    }
    return x % n;
  };
  return {
    nextU32,
    nextInt,
    nextFloat: () => nextU32() / TWO_32,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError("pick: empty array");
      }
      return items[nextInt(items.length)] as T;
    },
    state: () => [s0 >>> 0, s1 >>> 0, s2 >>> 0, s3 >>> 0],
  };
}

/** A generator seeded from a 32-bit seed (seed is taken modulo 2^32). */
export function createRng(seed: number): Rng {
  const sm = splitmix32(seed);
  const state: RngState = [sm(), sm(), sm(), sm()];
  if ((state[0] | state[1] | state[2] | state[3]) === 0) {
    state[0] = 1;
  }
  return createRngFromState(state);
}
