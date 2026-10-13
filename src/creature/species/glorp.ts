import {
  ACCESSORIES,
  BODY_SHAPES,
  PALETTES,
  type AccessoryId,
  type BodyShapeId,
} from '../appearance';
import { drawAccessoriesLocal, drawAccessoriesWorld } from '../render/drawAccessories';
import { drawFace } from '../render/drawFace';
import {
  bodyOutline,
  drawBlobFeet,
  drawBobble,
  drawNubArms,
  drawSoftBody,
  drawStalks,
  inLocal,
} from '../render/parts';
import type { SpeciesDef } from './types';

/** Freckles in body units (u across, v down from the centre) with radius in units of R. */
const FRECKLES = [
  [-0.62, -0.42, 0.032],
  [-0.5, -0.58, 0.024],
  [-0.72, -0.24, 0.02],
  [0.6, -0.48, 0.028],
  [0.48, -0.63, 0.02],
  [0.71, -0.3, 0.023],
] as const;

/** Glorp: the original jelly blob with two antennae. */
export const GLORP: SpeciesDef = {
  id: 'glorp',
  name: 'Glorp',
  tagline: 'A wobbly jelly blob with antennae and opinions.',
  personality: 'Curious, a bit weird, very huggable. Turns plain and serious when it has advice.',
  palettes: PALETTES,
  defaultPalette: 'mint',
  bodyShapes: Object.keys(BODY_SHAPES) as BodyShapeId[],
  eyeStyles: ['glossy', 'bean', 'mismatched', 'lashes'],
  accessories: Object.keys(ACCESSORIES) as AccessoryId[],
  dangly: [
    // Weird-but-cute: the left antenna is always a little floppier.
    {
      rootAngle: -Math.PI / 2 - 0.42,
      rootInset: 0.9,
      restAngle: -Math.PI / 2 - 0.36,
      curl: -0.1,
      droopCurl: -0.28,
      droopBias: 0.15,
      segments: 4,
      segLen: 0.15,
    },
    {
      rootAngle: -Math.PI / 2 + 0.42,
      rootInset: 0.9,
      restAngle: -Math.PI / 2 + 0.36,
      curl: 0.1,
      droopCurl: 0.28,
      segments: 4,
      segLen: 0.15,
    },
  ],
  draw(ctx, c, pose) {
    const pal = c.palette;
    drawStalks(ctx, c, pose, pal);
    inLocal(ctx, pose, () => {
      drawBlobFeet(ctx, c, pose, pal);
      const outline = bodyOutline(c, pose);
      drawNubArms(ctx, c, pose, pal);
      drawSoftBody(ctx, c.shape, outline, pose, pal, { freckles: FRECKLES });
      drawFace(ctx, pose, pal, c.eyeStyle, c.faceLayout);
      drawAccessoriesLocal(ctx, c, pose, outline);
    });
    const glowAmt =
      0.12 + 0.3 * pose.face.sparkle + (c.appearance.palette === 'midnight' ? 0.25 : 0);
    c.chains.forEach((chain, i) => {
      if (i === 0 && c.hasAccessory('flower')) return; // the daisy replaces this bobble
      const tip = chain.points[chain.points.length - 1]!;
      drawBobble(ctx, tip, pose.R * 0.105, pal.antennaTip, pal.outline, glowAmt, pose.R);
    });
    drawAccessoriesWorld(ctx, c, pose);
  },
};
