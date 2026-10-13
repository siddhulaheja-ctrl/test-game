import { describe, expect, it } from 'vitest';
import {
  ACCESSORIES,
  BODY_SHAPES,
  EYE_STYLES,
  PALETTES,
  normalizeAppearance,
  withAccessory,
} from './appearance';
import { contrast } from './color';

describe('appearance catalog', () => {
  it('ships at least 3 palettes, 3 eye styles and 5 accessories', () => {
    expect(Object.keys(PALETTES).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(EYE_STYLES).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(ACCESSORIES).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(BODY_SHAPES).length).toBeGreaterThanOrEqual(3);
  });

  it('ids match their keys', () => {
    for (const cat of [PALETTES, EYE_STYLES, BODY_SHAPES, ACCESSORIES]) {
      for (const [k, v] of Object.entries(cat)) expect(v.id).toBe(k);
    }
  });

  it('every palette outline stands out from its body colour', () => {
    for (const p of Object.values(PALETTES)) expect(contrast(p.outline, p.body)).toBeGreaterThan(3);
  });
});

describe('normalizeAppearance', () => {
  it('fills defaults and rejects unknown values', () => {
    const a = normalizeAppearance({
      palette: 'nope',
      eyes: 'bean',
      accessories: ['crown', 'bogus'],
      size: 99,
    });
    expect(a.palette).toBe('mint');
    expect(a.eyes).toBe('bean');
    expect(a.accessories).toEqual(['crown']);
    expect(a.size).toBe(2);
  });

  it('keeps one accessory per slot (last wins)', () => {
    expect(
      normalizeAppearance({ accessories: ['beanie', 'crown', 'glasses'] }).accessories,
    ).toEqual(['crown', 'glasses']);
    expect(withAccessory(['beanie', 'scarf'], 'crown')).toEqual(['scarf', 'crown']);
  });

  it('handles garbage input', () => {
    expect(normalizeAppearance(null).palette).toBe('mint');
    expect(normalizeAppearance('x').accessories).toEqual([]);
  });
});
