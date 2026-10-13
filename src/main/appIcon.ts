/**
 * The app icon (PEKKA's helmet), rasterised in code (no image assets). Shapes are defined in unit space [0, 1]
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

const rect = (x0: number, y0: number, x1: number, y1: number, color: RGBA): Shape => ({
  color,
  inside: (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1,
});

const INK: RGBA = [29, 20, 40, 255];
const STEEL: RGBA = [109, 129, 152, 255];
const STEEL_LIGHT: RGBA = [129, 149, 171, 255];
const SOCKET: RGBA = [30, 37, 55, 255];
const HORN: RGBA = [166, 76, 203, 255];
const HORN_LIGHT: RGBA = [201, 127, 224, 255];
const RING: RGBA = [164, 63, 207, 255];
const EYE: RGBA = [221, 214, 227, 255];

/** PEKKA's helmet: crescent horns, rounded dome, dark eye sockets with ringed eyes. */
const SHAPES: Shape[] = [
  // Horns (ink, then colour): out from the sides, then up.
  capsule(0.3, 0.46, 0.13, 0.36, 0.075, INK),
  capsule(0.13, 0.36, 0.17, 0.06, 0.06, INK),
  capsule(0.7, 0.46, 0.87, 0.36, 0.075, INK),
  capsule(0.87, 0.36, 0.83, 0.06, 0.06, INK),
  capsule(0.3, 0.46, 0.13, 0.36, 0.045, HORN),
  capsule(0.13, 0.36, 0.17, 0.08, 0.032, HORN_LIGHT),
  capsule(0.7, 0.46, 0.87, 0.36, 0.045, HORN),
  capsule(0.87, 0.36, 0.83, 0.08, 0.032, HORN_LIGHT),
  // Helmet: dome plus straight sides, outlined.
  ellipse(0.5, 0.42, 0.3, 0.3, INK),
  rect(0.2, 0.42, 0.8, 0.96, INK),
  ellipse(0.5, 0.42, 0.25, 0.25, STEEL),
  rect(0.25, 0.42, 0.75, 0.91, STEEL),
  rect(0.25, 0.3, 0.38, 0.91, STEEL_LIGHT),
  // Eye sockets, ringed eyes, nose plate.
  ellipse(0.38, 0.55, 0.1, 0.075, SOCKET),
  ellipse(0.62, 0.55, 0.1, 0.075, SOCKET),
  ellipse(0.39, 0.55, 0.05, 0.05, RING),
  ellipse(0.61, 0.55, 0.05, 0.05, RING),
  ellipse(0.39, 0.55, 0.028, 0.028, EYE),
  ellipse(0.61, 0.55, 0.028, 0.028, EYE),
  rect(0.475, 0.62, 0.525, 0.8, INK),
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
