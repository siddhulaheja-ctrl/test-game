// Bundles the Electron main process and preload script with esbuild.
// Usage: node scripts/build-main.mjs [--watch]
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  external: ['electron', 'koffi'],
  logLevel: 'info',
};

const configs = [
  { ...common, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs' },
  { ...common, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs' },
];

if (watch) {
  for (const c of configs) {
    const ctx = await esbuild.context(c);
    await ctx.watch();
  }
} else {
  await Promise.all(configs.map((c) => esbuild.build(c)));
}
