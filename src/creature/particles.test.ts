import { describe, expect, it } from 'vitest';
import { Rng } from '../core/random';
import { PARTICLE_KINDS, ParticleSystem, particleAlpha } from './particles';

describe('ParticleSystem', () => {
  it('emits, moves and expires every kind', () => {
    const ps = new ParticleSystem(new Rng(1));
    for (const k of PARTICLE_KINDS) ps.emit(k, 0, 0, 3, 46);
    expect(ps.count).toBe(PARTICLE_KINDS.length * 3);
    for (let i = 0; i < 30; i++) ps.update(1 / 60);
    expect(ps.particles.some((p) => p.x !== 0 || p.y !== 0)).toBe(true);
    for (let i = 0; i < 600; i++) ps.update(1 / 60);
    expect(ps.count).toBe(0);
  });

  it('hearts float up, sweat falls', () => {
    const ps = new ParticleSystem(new Rng(2));
    ps.emit('heart', 0, 0, 1, 46);
    ps.emit('sweat', 0, 0, 1, 46);
    for (let i = 0; i < 40; i++) ps.update(1 / 60);
    const [heart, sweat] = ps.particles;
    expect(heart!.y).toBeLessThan(-10);
    expect(sweat!.vy).toBeGreaterThan(0);
  });

  it('caps the pool and respects enabled=false', () => {
    const ps = new ParticleSystem(new Rng(3), 10);
    ps.emit('sparkle', 0, 0, 50, 46);
    expect(ps.count).toBe(10);
    ps.clear();
    ps.enabled = false;
    ps.emit('sparkle', 0, 0, 5, 46);
    expect(ps.count).toBe(0);
  });

  it('alpha fades in and out', () => {
    const p = { age: 0, life: 1 } as Parameters<typeof particleAlpha>[0];
    expect(particleAlpha(p)).toBe(0);
    expect(particleAlpha({ ...p, age: 0.5 })).toBeGreaterThan(0.8);
    expect(particleAlpha({ ...p, age: 0.99 })).toBeLessThan(0.05);
  });
});
