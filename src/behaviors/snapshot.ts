import type { Vec2 } from '../core/math';

/**
 * Enough to rebuild a pet on another display (multi-monitor hand-over). Plain data with no
 * drawing types, so main can relay it.
 */
export interface PetSnapshot {
  id: string;
  appearance: { species: string; palette: string; size: number };
  seed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  contact: 'surface' | 'wall' | 'air' | 'held';
  facing: -1 | 1;
  /** Where a trip was heading, so the new owner can carry on. */
  heading: Vec2 | null;
}
