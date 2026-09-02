import { describe, expect, it } from 'vitest';
import { createPrng, fnv1a32, seedMaterial } from './prng';

const material = seedMaterial(20260821, 10303);

describe('seeded PRNG', () => {
  it('builds the documented seed material', () => {
    expect(material).toBe('20260821|counterfactual-cost-draws-v1|round-10303');
  });

  it('hashes the material with 32-bit FNV-1a', () => {
    expect(fnv1a32(material)).toBe(337687762);
  });

  it('emits pinned xoshiro128** words', () => {
    const prng = createPrng(material);
    expect([prng.nextUint32(), prng.nextUint32(), prng.nextUint32(), prng.nextUint32()]).toEqual([
      1986836167, 2963554573, 1996299301, 1333640494,
    ]);
  });

  it('emits pinned 53-bit uniforms', () => {
    const prng = createPrng(material);
    const draws = Array.from({ length: 8 }, () => prng.uniform53());
    expect(draws).toEqual([
      0.46259634710853037, 0.4647996523269442, 0.7446371759146632, 0.43600918028769353,
      0.10049727866929181, 0.05459553490594993, 0.7141022633887543, 0.47870815648889675,
    ]);
  });

  it('keeps uniforms inside [0, 1)', () => {
    const prng = createPrng(material);
    for (let i = 0; i < 100_000; i += 1) {
      const u = prng.uniform53();
      expect(u >= 0 && u < 1).toBe(true);
    }
  });

  it('changes the stream when the seed or the round changes', () => {
    const reference = createPrng(material).uniform53();
    expect(createPrng(seedMaterial(1, 10303)).uniform53()).not.toBe(reference);
    expect(createPrng(seedMaterial(20260821, 10302)).uniform53()).not.toBe(reference);
  });

  it('fills a buffer with exactly the sequential uniform53 stream, also when interleaved', () => {
    const reference = createPrng(material);
    const expected = Array.from({ length: 5000 }, () => reference.uniform53());
    const bulk = createPrng(material);
    const buffer = new Float64Array(5000);
    bulk.fillUniform53(buffer, 5000);
    expect(Array.from(buffer)).toEqual(expected);
    const mixed = createPrng(material);
    const head = [mixed.uniform53(), mixed.uniform53(), mixed.uniform53()];
    const middle = new Float64Array(7);
    mixed.fillUniform53(middle, 7);
    const tail = [mixed.uniform53(), mixed.uniform53()];
    expect([...head, ...Array.from(middle), ...tail]).toEqual(expected.slice(0, 12));
  });
});
