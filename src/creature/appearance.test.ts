import './species';
import { describe, expect, it } from 'vitest';
import { normalizeAppearance } from './appearance';
import { contrast } from './color';
import { listSpecies } from './species';

describe('character catalog', () => {
  it('has at least one character, and palette ids match their keys', () => {
    expect(listSpecies().length).toBeGreaterThan(0);
    for (const sp of listSpecies()) {
      expect(sp.palettes[sp.defaultPalette]).toBeDefined();
      for (const [k, p] of Object.entries(sp.palettes)) expect(p.id).toBe(k);
    }
  });

  it('every palette of a character defines the same colour roles', () => {
    for (const sp of listSpecies()) {
      const roles = Object.keys(sp.palettes[sp.defaultPalette]!.colors).sort();
      for (const p of Object.values(sp.palettes))
        expect(Object.keys(p.colors).sort()).toEqual(roles);
    }
  });

  it('PEKKA outlines stand out from her armour in every palette', () => {
    const pekka = listSpecies().find((s) => s.id === 'pekka')!;
    for (const p of Object.values(pekka.palettes)) {
      expect(contrast(p.outline, p.colors.steelLight!)).toBeGreaterThan(3);
    }
  });
});

describe('normalizeAppearance', () => {
  it('fills defaults and rejects unknown values', () => {
    const a = normalizeAppearance({ species: 'nope', palette: 'nope', size: 99 });
    expect(a.species).toBe('pekka');
    expect(a.palette).toBe('steel');
    expect(a.size).toBe(2);
  });

  it('keeps valid choices', () => {
    expect(normalizeAppearance({ species: 'pekka', palette: 'amber', size: 1.2 })).toEqual({
      species: 'pekka',
      palette: 'amber',
      size: 1.2,
    });
  });

  it('handles garbage input', () => {
    expect(normalizeAppearance(null).species).toBe('pekka');
    expect(normalizeAppearance('x').size).toBe(1);
  });
});
