import { defaultSpeciesId, getSpecies, hasSpecies } from './species/registry';

/**
 * Customisation data model: palettes, eye styles, body shapes and accessories.
 * Everything here is plain data so it can be saved, edited in the lab, and extended by plugins.
 */

export interface Palette {
  id: string;
  name: string;
  body: string;
  bodyLight: string;
  bodyShade: string;
  outline: string;
  belly: string;
  cheek: string;
  iris: string;
  /** Second iris colour (used by the mismatched eye style). */
  irisAlt: string;
  mouth: string;
  tongue: string;
  antennaTip: string;
  /** Accent for sparkles, notes and accessory trim. */
  accent: string;
}

export const PALETTES = {
  mint: {
    id: 'mint',
    name: 'Pond Mint',
    body: '#8fe3c0',
    bodyLight: '#d2fae8',
    bodyShade: '#4fae8f',
    outline: '#2b5a4d',
    belly: '#effff7',
    cheek: '#ff9fb4',
    iris: '#3f7fb0',
    irisAlt: '#c98a2e',
    mouth: '#5c2a3c',
    tongue: '#ff8aa2',
    antennaTip: '#ffb0c8',
    accent: '#ffd36e',
  },
  peach: {
    id: 'peach',
    name: 'Peach Fuzz',
    body: '#ffc29e',
    bodyLight: '#ffeadb',
    bodyShade: '#e08860',
    outline: '#6b3526',
    belly: '#fff6ee',
    cheek: '#ff7f8e',
    iris: '#6a4a9c',
    irisAlt: '#2f8f7a',
    mouth: '#5a2230',
    tongue: '#ff8a98',
    antennaTip: '#ffe28a',
    accent: '#8fd6ff',
  },
  lilac: {
    id: 'lilac',
    name: 'Lilac Dream',
    body: '#c4b4ff',
    bodyLight: '#ece6ff',
    bodyShade: '#8a74d8',
    outline: '#3a3070',
    belly: '#f8f5ff',
    cheek: '#ff9fd2',
    iris: '#2f6f8f',
    irisAlt: '#c0466e',
    mouth: '#4a2140',
    tongue: '#ff8fb5',
    antennaTip: '#9ff0dc',
    accent: '#fff08a',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Jelly',
    body: '#5a6cb0',
    bodyLight: '#98a8e8',
    bodyShade: '#33407a',
    outline: '#161b3d',
    belly: '#a8b6f0',
    cheek: '#ff86b8',
    iris: '#ffd75e',
    irisAlt: '#7ff0e0',
    mouth: '#1f1030',
    tongue: '#ff7fa8',
    antennaTip: '#ffe46d',
    accent: '#ffe46d',
  },
  lemon: {
    id: 'lemon',
    name: 'Lemon Drop',
    body: '#ffe27e',
    bodyLight: '#fff7d0',
    bodyShade: '#e0b23c',
    outline: '#6a5218',
    belly: '#fffbe8',
    cheek: '#ffa08a',
    iris: '#5a7a2a',
    irisAlt: '#3a6ab0',
    mouth: '#5a2a1a',
    tongue: '#ff8f80',
    antennaTip: '#ff9dbb',
    accent: '#ff9dbb',
  },
} as const satisfies Record<string, Palette>;

/** Glorp's palette ids. Other species define their own palettes. */
export type PaletteId = keyof typeof PALETTES;

export interface EyeStyle {
  id: string;
  name: string;
  /** Eye half-width and half-height as a fraction of body radius. */
  rx: number;
  ry: number;
  /** Horizontal distance of each eye from centre, fraction of body radius. */
  spacing: number;
  sclera: boolean;
  lashes: boolean;
  /** Per-eye size multipliers [left, right] (mismatched eyes). */
  sizes: readonly [number, number];
  /** Per-eye vertical offsets [left, right], fraction of body radius. */
  offsets: readonly [number, number];
}

export const EYE_STYLES = {
  glossy: {
    id: 'glossy',
    name: 'Glossy',
    rx: 0.235,
    ry: 0.275,
    spacing: 0.4,
    sclera: true,
    lashes: false,
    sizes: [1, 1],
    offsets: [0, 0],
  },
  bean: {
    id: 'bean',
    name: 'Bean',
    rx: 0.115,
    ry: 0.18,
    spacing: 0.34,
    sclera: false,
    lashes: false,
    sizes: [1, 1],
    offsets: [0, 0],
  },
  mismatched: {
    id: 'mismatched',
    name: 'Mismatched',
    rx: 0.225,
    ry: 0.265,
    spacing: 0.41,
    sclera: true,
    lashes: false,
    sizes: [1.2, 0.8],
    offsets: [0.01, -0.05],
  },
  lashes: {
    id: 'lashes',
    name: 'Lashes',
    rx: 0.225,
    ry: 0.25,
    spacing: 0.4,
    sclera: true,
    lashes: true,
    sizes: [1, 1],
    offsets: [0, 0],
  },
} as const satisfies Record<string, EyeStyle>;

export type EyeStyleId = keyof typeof EYE_STYLES;

/**
 * Body outline as a two-part superellipse (top and bottom halves can differ) in units of body radius.
 * Larger exponents give flatter sides; `pear` widens the bottom; `peak` pinches the top into a point.
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

export const BODY_SHAPES = {
  round: {
    id: 'round',
    name: 'Classic',
    rx: 1,
    ryTop: 0.9,
    ryBottom: 0.82,
    nTop: 2.1,
    nBottom: 2.8,
    pear: 0.07,
    peak: 0,
  },
  bean: {
    id: 'bean',
    name: 'Tall Bean',
    rx: 0.84,
    ryTop: 1.12,
    ryBottom: 0.9,
    nTop: 2.1,
    nBottom: 2.6,
    pear: 0.12,
    peak: 0,
  },
  mochi: {
    id: 'mochi',
    name: 'Squishy Mochi',
    rx: 1.16,
    ryTop: 0.74,
    ryBottom: 0.6,
    nTop: 2.3,
    nBottom: 3.4,
    pear: 0.05,
    peak: 0,
  },
  drop: {
    id: 'drop',
    name: 'Droplet',
    rx: 0.96,
    ryTop: 1.12,
    ryBottom: 0.8,
    nTop: 2,
    nBottom: 2.6,
    pear: 0.06,
    peak: 0.32,
  },
} as const satisfies Record<string, BodyShape>;

export type BodyShapeId = keyof typeof BODY_SHAPES;

export type AccessorySlot = 'head' | 'ears' | 'face' | 'neck' | 'hair' | 'antenna';

export interface AccessoryDef {
  id: string;
  name: string;
  slot: AccessorySlot;
}

export const ACCESSORIES = {
  beanie: { id: 'beanie', name: 'Knit Beanie', slot: 'head' },
  crown: { id: 'crown', name: 'Tiny Crown', slot: 'head' },
  headphones: { id: 'headphones', name: 'Headphones', slot: 'ears' },
  glasses: { id: 'glasses', name: 'Round Glasses', slot: 'face' },
  scarf: { id: 'scarf', name: 'Striped Scarf', slot: 'neck' },
  bow: { id: 'bow', name: 'Ribbon Bow', slot: 'hair' },
  flower: { id: 'flower', name: 'Antenna Daisy', slot: 'antenna' },
} as const satisfies Record<string, AccessoryDef>;

export type AccessoryId = keyof typeof ACCESSORIES;

export interface Appearance {
  /** Which character (see `species/`). */
  species: string;
  /** Palette id within the species' palettes. */
  palette: string;
  eyes: EyeStyleId;
  body: BodyShapeId;
  accessories: AccessoryId[];
  /** Overall scale (1 = default, larger for the accessibility "large creature" option). */
  size: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
  species: 'glorp',
  palette: 'mint',
  eyes: 'glossy',
  body: 'round',
  accessories: [],
  size: 1,
};

/** Base body radius in CSS px at size 1. */
export const BASE_RADIUS = 46;

const has = <T extends object>(obj: T, key: unknown): key is keyof T =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Add an accessory, removing any other accessory in the same slot.
 * Returns a new list; the input is not changed.
 */
export function withAccessory(list: readonly AccessoryId[], id: AccessoryId): AccessoryId[] {
  const slot = ACCESSORIES[id].slot;
  return [...list.filter((a) => ACCESSORIES[a].slot !== slot), id];
}

/**
 * Coerce unknown (saved, user-edited, plugin-supplied) data into a valid Appearance.
 * Palette, eyes, body and accessories are checked against what the species allows; a species
 * change keeps whatever still fits and falls back to the species defaults for the rest.
 */
export function normalizeAppearance(input: unknown): Appearance {
  const src = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const species = getSpecies(hasSpecies(src.species) ? src.species : defaultSpeciesId());
  let accessories: AccessoryId[] = [];
  if (Array.isArray(src.accessories)) {
    for (const a of src.accessories) {
      if (has(ACCESSORIES, a) && species.accessories.includes(a)) {
        accessories = withAccessory(accessories, a);
      }
    }
  }
  const size = typeof src.size === 'number' && Number.isFinite(src.size) ? src.size : 1;
  const eyeOk = (e: unknown): e is EyeStyleId =>
    has(EYE_STYLES, e) && (species.eyeStyles.length === 0 || species.eyeStyles.includes(e));
  const bodies = species.bodyShapes ?? [];
  const bodyOk = (b: unknown): b is BodyShapeId => has(BODY_SHAPES, b) && bodies.includes(b);
  return {
    species: species.id,
    palette: has(species.palettes, src.palette) ? src.palette : species.defaultPalette,
    eyes: eyeOk(src.eyes) ? src.eyes : (species.eyeStyles[0] ?? DEFAULT_APPEARANCE.eyes),
    body: bodyOk(src.body) ? src.body : (bodies[0] ?? DEFAULT_APPEARANCE.body),
    accessories,
    size: Math.min(2, Math.max(0.6, size)),
  };
}
