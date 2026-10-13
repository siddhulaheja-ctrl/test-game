import { defaultSpeciesId, getSpecies, hasSpecies } from './species/registry';

/**
 * Appearance data model: which character, which palette, how big.
 * Plain data so it can be saved, edited in the lab, and extended by plugins.
 */

export interface Palette {
  id: string;
  name: string;
  /** Ink colour for outlines (particles use it too). */
  outline: string;
  /** Main accent: sparkles, notes, butterflies. */
  accent: string;
  /** Second accent: heart and butterfly variants. */
  accent2: string;
  /** Character-specific colour roles, read only by that character's renderer. */
  colors: Readonly<Record<string, string>>;
}

/**
 * Hit-test and shadow envelope as a two-part superellipse (top and bottom halves can differ), in
 * units of body radius. Larger exponents give flatter sides; `pear` widens the bottom; `peak`
 * pinches the top into a point.
 */
export interface BodyShape {
  id: string;
  name: string;
  rx: number;
  ryTop: number;
  ryBottom: number;
  nTop: number;
  nBottom: number;
  pear: number;
  peak: number;
}

export interface Appearance {
  /** Which character (see `species/`). */
  species: string;
  /** Palette id within the character's palettes. */
  palette: string;
  /** Overall scale (1 = default, larger for the accessibility "large creature" option). */
  size: number;
}

/** Base body radius in CSS px at size 1. */
export const BASE_RADIUS = 46;

/**
 * Coerce unknown (saved, user-edited, plugin-supplied) data into a valid Appearance.
 * Unknown characters fall back to the default one; unknown palettes to the character's default.
 */
export function normalizeAppearance(input: unknown): Appearance {
  const src = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const species = getSpecies(hasSpecies(src.species) ? src.species : defaultSpeciesId());
  const palette =
    typeof src.palette === 'string' &&
    Object.prototype.hasOwnProperty.call(species.palettes, src.palette)
      ? src.palette
      : species.defaultPalette;
  const size = typeof src.size === 'number' && Number.isFinite(src.size) ? src.size : 1;
  return { species: species.id, palette, size: Math.min(2, Math.max(0.6, size)) };
}
