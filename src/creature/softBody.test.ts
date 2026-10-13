import { describe, expect, it } from 'vitest';
import { BODY_SHAPES } from './appearance';
import { SoftRing, restPoint } from './softBody';

describe('restPoint', () => {
  it('hits the extremes of each shape', () => {
    for (const s of Object.values(BODY_SHAPES)) {
      expect(restPoint(s, 0).x).toBeCloseTo(s.rx, 5);
      expect(restPoint(s, Math.PI / 2).y).toBeCloseTo(s.ryBottom, 5);
      expect(restPoint(s, -Math.PI / 2).y).toBeLessThanOrEqual(-s.ryTop + 1e-9);
    }
  });
});

describe('SoftRing', () => {
  it('a poke dents locally, then the jelly settles back to rest', () => {
    const ring = new SoftRing();
    ring.impulse(0, -3);
    for (let i = 0; i < 6; i++) ring.step(1 / 60);
    const near = ring.offset[0]!;
    const far = ring.offset[ring.count / 2]!;
    expect(near).toBeLessThan(-0.02);
    expect(Math.abs(far)).toBeLessThan(Math.abs(near) / 4);
    for (let i = 0; i < 600; i++) ring.step(1 / 60);
    expect(ring.energy()).toBeLessThan(1e-3);
  });

  it('stays bounded under repeated hard impulses (stable integration)', () => {
    const ring = new SoftRing();
    for (let i = 0; i < 300; i++) {
      if (i % 10 === 0) ring.impulse(i, -8, 0.3);
      ring.step(1 / 60);
      for (const o of ring.offset) expect(Number.isFinite(o) && Math.abs(o) <= 0.35).toBe(true);
    }
  });
});
