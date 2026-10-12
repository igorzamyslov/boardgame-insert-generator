import { describe, expect, it } from "vitest";
import { createRng, createRngFromState, splitmix32 } from "./prng";

describe("prng", () => {
  it("matches the xoshiro128** reference vector for state [1, 2, 3, 4]", () => {
    const r = createRngFromState([1, 2, 3, 4]);
    const out = Array.from({ length: 10 }, () => r.nextU32());
    expect(out).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597,
      4258142804,
    ]);
  });

  it("seeds through splitmix32 with a known sequence", () => {
    const sm = splitmix32(0);
    expect([sm(), sm(), sm()]).toEqual([1684164658, 3653269916, 2939563536]);
    expect(createRng(42).state()).toEqual([551831576, 144025891, 322543647, 3034809370]);
    const a = createRng(42);
    expect(Array.from({ length: 5 }, () => a.nextU32())).toEqual([
      660444221, 3652823732, 77672526, 910233633, 2297337756,
    ]);
  });

  it("produces known nextInt and nextFloat values", () => {
    const b = createRng(7);
    expect(Array.from({ length: 8 }, () => b.nextInt(10))).toEqual([3, 2, 0, 0, 5, 6, 0, 8]);
    const c = createRng(7);
    expect(c.nextFloat()).toBe(0.04900959390215576);
  });

  it("is deterministic per seed and differs between seeds", () => {
    const x = createRng(123);
    const y = createRng(123);
    const z = createRng(124);
    const xs = Array.from({ length: 20 }, () => x.nextU32());
    expect(Array.from({ length: 20 }, () => y.nextU32())).toEqual(xs);
    expect(Array.from({ length: 20 }, () => z.nextU32())).not.toEqual(xs);
  });

  it("keeps nextInt in range and rejects bad bounds", () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.nextInt(7);
      expect(v >= 0 && v < 7 && Number.isInteger(v)).toBe(true);
    }
    expect(r.nextInt(1)).toBe(0);
    expect(() => r.nextInt(0)).toThrow(RangeError);
    expect(() => r.nextInt(2.5)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
  });

  it("keeps nextFloat in [0, 1)", () => {
    const r = createRng(5);
    for (let i = 0; i < 1000; i++) {
      const f = r.nextFloat();
      expect(f >= 0 && f < 1).toBe(true);
    }
  });

  it("rejects an all-zero state", () => {
    expect(() => createRngFromState([0, 0, 0, 0])).toThrow(RangeError);
  });
});
