import path from 'node:path';

/** Vite dev server URL in development (`npm run dev`), unset in production builds. */
export const devServerUrl = process.env.GLORP_DEV_SERVER_URL;

/** Bundled preload script (built next to the main bundle). */
export const preloadPath = path.join(__dirname, '../preload/index.cjs');

export type PageName = 'overlay' | 'lab';

/** Load a renderer page into a window, from the dev server or the built files. */
export function pageLocation(page: PageName): { url: string } | { file: string } {
  if (devServerUrl) return { url: `${devServerUrl}/${page}/index.html` };
  return { file: path.join(__dirname, `../renderer/${page}/index.html`) };
}
