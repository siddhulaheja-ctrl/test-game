import { describe, expect, it } from 'vitest';
import { Rng } from './random';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });

  it('stays within range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(3);
      const n = r.int(1, 6);
      expect(Number.isInteger(n) && n >= 1 && n <= 6).toBe(true);
    }
  });

  it('weighted() never picks zero-weight entries and roughly respects weights', () => {
    const r = new Rng(7);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) {
      counts[
        r.weighted([
          ['a', 1],
          ['b', 3],
          ['c', 0],
        ] as const)
      ]++;
    }
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(2.4);
    expect(counts.b / counts.a).toBeLessThan(3.6);
  });
});
