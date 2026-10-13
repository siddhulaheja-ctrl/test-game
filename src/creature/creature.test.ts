import { describe, expect, it } from 'vitest';
import { Creature } from './creature';

const step = (c: Creature, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) c.update(1 / 60);
};

describe('Creature', () => {
  it('hops with anticipation, flies, and lands with a squash and dust', () => {
    const c = new Creature({ seed: 1, x: 100, y: 300 });
    c.anim.enabled = false;
    c.hop(1);
    step(c, 0.1);
    expect(c.getPose().lift).toBe(0); // still crouching
    expect(c.getPose().sy).toBeLessThan(1);
    step(c, 0.2);
    expect(c.getPose().lift).toBeGreaterThan(15);
    step(c, 0.35);
    expect(c.getPose().lift).toBe(0);
    expect(c.particles.particles.some((p) => p.kind === 'dust')).toBe(true);
    step(c, 3);
    expect(Math.abs(c.getPose().sy - 1)).toBeLessThan(0.05);
  });

  it('poking makes it react and jiggle', () => {
    const c = new Creature({ seed: 2, x: 100, y: 300 });
    c.poke(130, 260);
    step(c, 0.1);
    expect(['surprised', 'happy']).toContain(c.mixer.dominant());
    expect(c.ring.energy()).toBeGreaterThan(0.01);
  });

  it('hit shape covers the body and not far-away points', () => {
    const c = new Creature({ x: 100, y: 300 });
    const p = c.getPose();
    const hs = c.hitShape();
    expect(hs.distanceOutside(100, 300 + p.center.y)).toBeLessThanOrEqual(0);
    expect(hs.distanceOutside(400, 50)).toBeGreaterThan(100);
  });

  it('antennae lag behind fast motion then settle back to rest', () => {
    const c = new Creature({ x: 100, y: 300 });
    c.anim.enabled = false;
    const tip = () => ({ ...c.antennae[1].points.at(-1)! });
    step(c, 1);
    const rest = tip();
    c.x += 40;
    step(c, 1 / 60);
    expect(tip().x - rest.x).toBeLessThan(40); // lagging
    step(c, 3);
    expect(Math.abs(tip().x - rest.x - 40)).toBeLessThan(1);
  });

  it('appearance changes are normalised', () => {
    const c = new Creature();
    c.setAppearance({ accessories: ['beanie', 'crown'], size: 1.5 });
    expect(c.appearance.accessories).toEqual(['crown']);
    expect(c.R).toBeCloseTo(46 * 1.5);
  });

  it('activity falls to ~0 when idle animations are off and it has settled', () => {
    const c = new Creature();
    c.anim.enabled = false;
    c.poke(10, -40);
    step(c, 0.2);
    const busy = c.activity();
    step(c, 6);
    expect(busy).toBeGreaterThan(c.activity());
    expect(c.activity()).toBeLessThan(0.05);
  });
});
