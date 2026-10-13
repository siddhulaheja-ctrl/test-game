import { describe, expect, it } from 'vitest';
import { Rng } from '../core/random';
import { IdleAnimator } from './idleAnimator';

const host = { squash: () => {}, kickChains: () => {} };

function run(anim: IdleAnimator, seconds: number, each?: () => void) {
  for (let i = 0; i < seconds * 60; i++) {
    anim.update(1 / 60);
    each?.();
  }
}

describe('IdleAnimator', () => {
  it('blinks every few seconds at random', () => {
    const anim = new IdleAnimator(new Rng(3), host);
    let blinks = 0;
    let wasClosed = false;
    run(anim, 60, () => {
      const closed = anim.layer.eyeOpenMul < 0.3;
      if (closed && !wasClosed) blinks++;
      wasClosed = closed;
    });
    // 2–6 s apart plus occasional doubles (yawns also close the eyes): roughly 9–35 per minute.
    expect(blinks).toBeGreaterThanOrEqual(9);
    expect(blinks).toBeLessThanOrEqual(35);
  });

  it('is never perfectly still: breathing always moves', () => {
    const anim = new IdleAnimator(new Rng(1), host);
    anim.enabled = false;
    const values = new Set<number>();
    run(anim, 3, () => values.add(Math.round(anim.layer.breathe * 1e4)));
    expect(values.size).toBeGreaterThan(20);
  });

  it('yawns open the mouth and close the eyes, then end', () => {
    const anim = new IdleAnimator(new Rng(1), host);
    anim.enabled = false;
    anim.triggerYawn();
    run(anim, 1.2);
    expect(anim.layer.mouthOpenAdd).toBeGreaterThan(0.5);
    expect(anim.layer.eyeOpenMul).toBeLessThan(0.3);
    run(anim, 2);
    expect(anim.isYawning).toBe(false);
    expect(anim.layer.mouthOpenAdd).toBe(0);
  });

  it('sleepy creatures yawn more often', () => {
    const count = (sleepiness: number) => {
      const anim = new IdleAnimator(new Rng(9), host);
      anim.sleepiness = sleepiness;
      let n = 0;
      let was = false;
      run(anim, 300, () => {
        if (anim.isYawning && !was) n++;
        was = anim.isYawning;
      });
      return n;
    };
    expect(count(1)).toBeGreaterThan(count(0));
  });

  it('follows an external focus', () => {
    const anim = new IdleAnimator(new Rng(1), host);
    anim.setFocus({ x: 1, y: 0 });
    run(anim, 0.5);
    expect(anim.layer.lookX).toBeGreaterThan(0.9);
  });

  it('is deterministic for a seed', () => {
    const a = new IdleAnimator(new Rng(5), host);
    const b = new IdleAnimator(new Rng(5), host);
    run(a, 20);
    run(b, 20);
    expect(a.layer).toEqual(b.layer);
  });
});
