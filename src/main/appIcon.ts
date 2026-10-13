/**
 * Glorp's icon, rasterised in code (no image assets). Shapes are defined in unit space [0, 1]
 * and painted back-to-front with 4x4 supersampling for smooth edges.
 */

type RGBA = readonly [number, number, number, number];
type Shape = { inside(x: number, y: number): boolean; color: RGBA };

const ellipse = (cx: number, cy: number, rx: number, ry: number, color: RGBA): Shape => ({
  color,
  inside: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
});

/** A line segment with round caps. */
const capsule = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  color: RGBA,
): Shape => ({
  color,
  inside: (x, y) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r * r;
  },
});

const OUTLINE: RGBA = [46, 84, 74, 255];
const BODY: RGBA = [140, 224, 190, 255];
const BODY_LIGHT: RGBA = [188, 244, 218, 255];
const TIP: RGBA = [255, 168, 196, 255];
const EYE: RGBA = [34, 40, 52, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const CHEEK: RGBA = [255, 150, 170, 200];

const SHAPES: Shape[] = [
  // antennae (stalk outline, then fill), with blush-pink bobbles
  capsule(0.4, 0.32, 0.3, 0.12, 0.045, OUTLINE),
  capsule(0.6, 0.32, 0.72, 0.14, 0.045, OUTLINE),
  ellipse(0.29, 0.11, 0.085, 0.085, OUTLINE),
  ellipse(0.73, 0.13, 0.085, 0.085, OUTLINE),
  ellipse(0.29, 0.11, 0.055, 0.055, TIP),
  ellipse(0.73, 0.13, 0.055, 0.055, TIP),
  // body
  ellipse(0.5, 0.62, 0.46, 0.37, OUTLINE),
  ellipse(0.5, 0.62, 0.405, 0.315, BODY),
  ellipse(0.43, 0.52, 0.22, 0.12, BODY_LIGHT),
  // face
  ellipse(0.3, 0.7, 0.07, 0.04, CHEEK),
  ellipse(0.7, 0.7, 0.07, 0.04, CHEEK),
  ellipse(0.39, 0.6, 0.065, 0.09, EYE),
  ellipse(0.61, 0.6, 0.065, 0.09, EYE),
  ellipse(0.41, 0.565, 0.025, 0.025, WHITE),
  ellipse(0.63, 0.565, 0.025, 0.025, WHITE),
  capsule(0.46, 0.73, 0.5, 0.75, 0.018, OUTLINE),
  capsule(0.5, 0.75, 0.54, 0.73, 0.018, OUTLINE),
];

/** Render the icon to straight RGBA pixels. */
export function renderIconRGBA(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const ss = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          // Composite shapes back-to-front for this subsample (premultiplied).
          let cr = 0;
          let cg = 0;
          let cb = 0;
          let ca = 0;
          for (const s of SHAPES) {
            if (!s.inside(x, y)) continue;
            const sa = s.color[3] / 255;
            cr = s.color[0] * sa + cr * (1 - sa);
            cg = s.color[1] * sa + cg * (1 - sa);
            cb = s.color[2] * sa + cb * (1 - sa);
            ca = sa + ca * (1 - sa);
          }
          r += cr;
          g += cg;
          b += cb;
          a += ca;
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 4;
      const alpha = a / n;
      out[i] = alpha > 0 ? Math.round(r / n / alpha) : 0;
      out[i + 1] = alpha > 0 ? Math.round(g / n / alpha) : 0;
      out[i + 2] = alpha > 0 ? Math.round(b / n / alpha) : 0;
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}
