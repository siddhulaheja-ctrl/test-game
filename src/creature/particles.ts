import type { Rng } from '../core/random';

export const PARTICLE_KINDS = [
  'sparkle',
  'heart',
  'sweat',
  'zzz',
  'note',
  'dust',
  'exclaim',
  'question',
  'butterfly',
] as const;
export type ParticleKind = (typeof PARTICLE_KINDS)[number];

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds lived. */
  age: number;
  life: number;
  size: number;
  rot: number;
  spin: number;
  /** Per-particle random 0..1 (wobble phase, colour variant). */
  seed: number;
}

interface KindSpec {
  life: [number, number];
  speed: [number, number];
  /** Emission direction (radians, canvas: −π/2 = up) and spread. */
  dir: number;
  spread: number;
  gravity: number;
  /** Fraction of velocity kept per second. */
  drag: number;
  size: [number, number];
  spin: [number, number];
}

const UP = -Math.PI / 2;

/** Physics presets per kind. Sizes are in units of body radius. */
export const PARTICLE_SPECS: Record<ParticleKind, KindSpec> = {
  sparkle: {
    life: [0.6, 1.1],
    speed: [40, 120],
    dir: UP,
    spread: 1.6,
    gravity: 30,
    drag: 0.15,
    size: [0.1, 0.2],
    spin: [-3, 3],
  },
  heart: {
    life: [1.2, 1.8],
    speed: [35, 70],
    dir: UP,
    spread: 0.7,
    gravity: -25,
    drag: 0.4,
    size: [0.16, 0.24],
    spin: [-0.6, 0.6],
  },
  sweat: {
    life: [0.7, 1.0],
    speed: [50, 90],
    dir: UP,
    spread: 0.9,
    gravity: 320,
    drag: 0.6,
    size: [0.1, 0.14],
    spin: [0, 0],
  },
  zzz: {
    life: [2.2, 2.8],
    speed: [18, 28],
    dir: UP + 0.5,
    spread: 0.2,
    gravity: -6,
    drag: 0.6,
    size: [0.14, 0.26],
    spin: [-0.3, 0.3],
  },
  note: {
    life: [1.4, 2.0],
    speed: [30, 55],
    dir: UP,
    spread: 1.0,
    gravity: -15,
    drag: 0.5,
    size: [0.16, 0.22],
    spin: [-1, 1],
  },
  dust: {
    life: [0.45, 0.75],
    speed: [40, 110],
    dir: 0,
    spread: Math.PI,
    gravity: -30,
    drag: 0.04,
    size: [0.1, 0.18],
    spin: [0, 0],
  },
  exclaim: {
    life: [0.9, 1.1],
    speed: [60, 70],
    dir: UP,
    spread: 0.05,
    gravity: 140,
    drag: 0.1,
    size: [0.32, 0.32],
    spin: [0, 0],
  },
  question: {
    life: [1.2, 1.4],
    speed: [45, 55],
    dir: UP,
    spread: 0.05,
    gravity: 80,
    drag: 0.1,
    size: [0.3, 0.3],
    spin: [0, 0],
  },
  butterfly: {
    life: [2.6, 3.4],
    speed: [25, 45],
    dir: UP,
    spread: 1.4,
    gravity: -12,
    drag: 0.5,
    size: [0.18, 0.24],
    spin: [0, 0],
  },
};

/** A pooled particle system. Pure logic; drawing lives in `render/drawParticles.ts`. */
export class ParticleSystem {
  readonly particles: Particle[] = [];
  enabled = true;

  constructor(
    private readonly rng: Rng,
    readonly max = 160,
  ) {}

  /**
   * Emit `count` particles of a kind at (x, y). `scale` is the creature's body radius in px, so
   * particle sizes and speeds follow the creature's size.
   */
  emit(
    kind: ParticleKind,
    x: number,
    y: number,
    count: number,
    scale: number,
    opts: { dir?: number; spread?: number } = {},
  ): void {
    if (!this.enabled) return;
    const spec = PARTICLE_SPECS[kind];
    const speedScale = scale / 46;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.max) this.particles.shift();
      const dir =
        (opts.dir ?? spec.dir) + this.rng.range(-1, 1) * (opts.spread ?? spec.spread) * 0.5;
      const speed = this.rng.range(...spec.speed) * speedScale;
      this.particles.push({
        kind,
        x: x + this.rng.range(-0.15, 0.15) * scale,
        y: y + this.rng.range(-0.1, 0.1) * scale,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        age: kind === 'zzz' ? -i * 0.55 : 0, // staggered Zs
        life: this.rng.range(...spec.life) + (kind === 'zzz' ? i * 0.55 : 0),
        size: this.rng.range(...spec.size) * scale * (kind === 'zzz' ? 1 + i * 0.35 : 1),
        rot: kind === 'sparkle' ? this.rng.range(0, Math.PI) : 0,
        spin: this.rng.range(...spec.spin),
        seed: this.rng.next(),
      });
    }
  }

  update(dt: number): void {
    const ps = this.particles;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.age >= 0) {
        const spec = PARTICLE_SPECS[p.kind];
        const keep = Math.pow(spec.drag, dt);
        p.vx *= keep;
        p.vy = p.vy * keep + spec.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }
      ps[w++] = p;
    }
    ps.length = w;
  }

  clear(): void {
    this.particles.length = 0;
  }

  get count(): number {
    return this.particles.length;
  }
}

/** Opacity over a particle's life: quick fade in, ease out at the end. */
export function particleAlpha(p: Particle): number {
  if (p.age < 0) return 0;
  const t = p.age / p.life;
  const fadeIn = Math.min(1, p.age / 0.08);
  return fadeIn * (1 - t * t * t);
}
