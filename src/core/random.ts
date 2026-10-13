/** Seeded random numbers (mulberry32), so animations and tests are reproducible. */
export class Rng {
  private state: number;

  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() from empty list');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Pick by weight. Entries with weight <= 0 are never chosen. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
    if (total <= 0) throw new Error('weighted() needs a positive total weight');
    let r = this.next() * total;
    for (const [item, w] of entries) {
      if (w <= 0) continue;
      r -= w;
      if (r < 0) return item;
    }
    return entries[entries.length - 1]![0];
  }

  /** Independent child generator (so adding draws in one system doesn't shift another). */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}
