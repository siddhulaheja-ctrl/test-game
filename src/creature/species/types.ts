import type { AccessoryId, BodyShape, BodyShapeId, EyeStyleId, Palette } from '../appearance';
import type { Creature, CreaturePose } from '../creature';

/**
 * A dangly chain attached to the body outline (antennae, gills, flame tongues, a robot aerial).
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
  /** Constant droop added to the face's droop (the floppy left antenna). */
  droopBias?: number;
  segments: number;
  /** Segment length in units of body radius. */
  segLen: number;
  stiffness?: number;
  friction?: number;
  /** px/s² (negative floats upward, for flames). */
  gravity?: number;
}

/** Placement of the generic face parts, in units of body radius from the body centre. */
export interface FaceLayout {
  eyeY: number;
  mouthY: number;
  cheekX: number;
  cheekY: number;
  /** Multiplies eye size and spacing of the chosen eye style. */
  eyeScale: number;
}

/**
 * A playable character. Physics, expressions, idle animation and behaviours are shared by every
 * species; a species supplies its shape, its dangly bits, its palettes and how it is drawn.
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
  /** Fixed rest shape. If absent, the appearance's body shape is used (Glorp). */
  shape?: BodyShape;
  /** Body shapes the user may pick (only when `shape` is absent). */
  bodyShapes?: readonly BodyShapeId[];
  /** Eye styles the user may pick for the generic face (first is the default). Empty = custom face. */
  eyeStyles: readonly EyeStyleId[];
  /** Accessories this species can wear. */
  accessories: readonly AccessoryId[];
  dangly: readonly DanglyDef[];
  faceLayout?: Partial<FaceLayout>;
  /** Jelly softness (1 = Glorp). Lower is stiffer (armour, robots). */
  softness?: number;
  /** Floats this far above the ground (units of body radius) and bobs gently. */
  hover?: number;
  /** Ground shadow width multiplier. */
  shadowScale?: number;
  /**
   * Draw everything except the ground shadow and particles, in world space.
   * Use `creature.toWorld` / the pose transform helpers in `render/parts.ts`.
   */
  draw(ctx: CanvasRenderingContext2D, creature: Creature, pose: CreaturePose): void;
}

export const DEFAULT_FACE_LAYOUT: FaceLayout = {
  eyeY: -0.04,
  mouthY: 0.3,
  cheekX: 0.6,
  cheekY: 0.2,
  eyeScale: 1,
};
