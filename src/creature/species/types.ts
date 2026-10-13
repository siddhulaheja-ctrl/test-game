import type { BodyShape, Palette } from '../appearance';
import type { Creature, CreaturePose } from '../creature';
import type { FaceParams } from '../face';

/**
 * A dangly chain attached to the body outline (antennae, gills, tails, cables).
 * Simulated as a verlet rope that lags behind the body and is pulled toward its rest pose.
 */
export interface DanglyDef {
  /** Where the root sits on the rest outline (radians; −π/2 is the top, 0 is the right side). */
  rootAngle: number;
  /** Root position as a fraction of the outline radius (pulls it inside the body). */
  rootInset: number;
  /** Direction of the first segment (radians, before body tilt). */
  restAngle: number;
  /** Bend added per segment (radians, signed). */
  curl: number;
  /** Extra bend per segment at full droop (signed; same sign as `curl` to droop outward). */
  droopCurl: number;
  /** Constant droop added to the face's droop. */
  droopBias?: number;
  segments: number;
  /** Segment length in units of body radius. */
  segLen: number;
  stiffness?: number;
  friction?: number;
  /** px/s² (negative floats upward). */
  gravity?: number;
}

/**
 * A playable character. Physics, expressions, idle animation and behaviours are shared by every
 * species; a species supplies its envelope, any dangly bits, its palettes and how it is drawn.
 */
export interface SpeciesDef {
  id: string;
  name: string;
  /** One line shown in pickers. */
  tagline: string;
  /** Short personality note for later stages (line banks, behaviour weights). */
  personality: string;
  palettes: Record<string, Palette>;
  defaultPalette: string;
  /** Hit-test / shadow envelope. */
  shape: BodyShape;
  dangly: readonly DanglyDef[];
  /** Softness of the body's spring ring (1 = jelly). Lower is stiffer (armour, robots). */
  softness?: number;
  /** Floats this far above the ground (units of body radius) and bobs gently. */
  hover?: number;
  /** Ground shadow width multiplier. */
  shadowScale?: number;
  /** Added to the blended face every frame (a character's resting look, e.g. a stern slant). */
  faceBias?: Partial<FaceParams>;
  /** Per-species simulation extras (flicker, blinking lights, spawning particles). */
  update?(creature: Creature, dt: number): void;
  /** Draw everything except the ground shadow and particles, in world space. */
  draw(ctx: CanvasRenderingContext2D, creature: Creature, pose: CreaturePose): void;
}
