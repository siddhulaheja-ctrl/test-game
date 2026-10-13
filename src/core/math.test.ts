import { describe, expect, it } from 'vitest';
import { approach, clamp, easeOutBack, remap } from './math';

describe('math', () => {
  it('approach() halves the distance every half-life regardless of step size', () => {
    let a = 0;
    for (let i = 0; i < 10; i++) a = approach(a, 1, 0.5, 0.05);
    let b = 0;
    b = approach(b, 1, 0.5, 0.5);
    expect(a).toBeCloseTo(0.5, 6);
    expect(b).toBeCloseTo(0.5, 6);
  });

  it('clamp and remap', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
  });

  it('easeOutBack overshoots then settles at 1', () => {
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map((t) => easeOutBack(t)))).toBeGreaterThan(1);
  });
});
