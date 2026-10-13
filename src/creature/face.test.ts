import { describe, expect, it } from 'vitest';
import {
  EXPRESSIONS,
  EXPRESSION_NAMES,
  ExpressionMixer,
  FACE_KEYS,
  FACE_RANGES,
  NEUTRAL_FACE,
  blendFace,
  clampFace,
} from './face';

describe('blendFace', () => {
  it('a single expression at weight 1 returns exactly that expression', () => {
    for (const name of EXPRESSION_NAMES)
      expect(blendFace({ [name]: 1 })).toEqual(EXPRESSIONS[name]);
  });

  it('half weight lands halfway between neutral and the expression', () => {
    const half = blendFace({ happy: 0.5 });
    for (const k of FACE_KEYS) {
      expect(half[k]).toBeCloseTo((NEUTRAL_FACE[k] + EXPRESSIONS.happy[k]) / 2, 6);
    }
  });

  it('normalises weights that sum to more than 1', () => {
    const mix = blendFace({ happy: 1, sad: 1 });
    expect(mix.mouthCurve).toBeCloseTo(
      (EXPRESSIONS.happy.mouthCurve + EXPRESSIONS.sad.mouthCurve) / 2,
    );
  });

  it('every expression is distinct and within parameter ranges', () => {
    const seen = new Set<string>();
    for (const name of EXPRESSION_NAMES) {
      const f = EXPRESSIONS[name];
      expect(clampFace(f)).toEqual(f);
      seen.add(JSON.stringify(f));
    }
    expect(seen.size).toBe(EXPRESSION_NAMES.length);
  });

  it('clampFace keeps values inside FACE_RANGES', () => {
    const wild = clampFace({ ...NEUTRAL_FACE, eyeOpen: 9, mouthCurve: -9 });
    expect(wild.eyeOpen).toBe(FACE_RANGES.eyeOpen[1]);
    expect(wild.mouthCurve).toBe(-1);
  });
});

describe('ExpressionMixer', () => {
  it('eases toward the base mood', () => {
    const m = new ExpressionMixer();
    m.setBase({ sad: 1 });
    m.update(0.05);
    const partial = m.weights().sad;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
    for (let i = 0; i < 60; i++) m.update(1 / 60);
    expect(m.weights().sad).toBeGreaterThan(0.99);
    expect(m.dominant()).toBe('sad');
  });

  it('reactions override the base, then fade back', () => {
    const m = new ExpressionMixer();
    m.setBase({ happy: 1 });
    m.settle();
    m.react('surprised', 1, 0.5);
    for (let i = 0; i < 20; i++) m.update(1 / 60);
    expect(m.dominant()).toBe('surprised');
    for (let i = 0; i < 120; i++) m.update(1 / 60);
    expect(m.activeReaction).toBeNull();
    expect(m.dominant()).toBe('happy');
  });
});
