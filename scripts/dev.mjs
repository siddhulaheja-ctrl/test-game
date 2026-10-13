// Development runner: Vite dev server (renderer HMR) + esbuild watch (main/preload) + Electron.
// Electron restarts automatically when the main or preload bundle changes.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { createServer } from 'vite';
import electronPath from 'electron';

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = `http://localhost:${server.config.server.port}`;

const builder = spawn(process.execPath, ['scripts/build-main.mjs', '--watch'], {
  stdio: 'inherit',
});

let electron = null;
let restartTimer = null;
const launch = () => {
  electron = spawn(String(electronPath), ['.', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, GLORP_DEV_SERVER_URL: url },
  });
  electron.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM') shutdown(code ?? 0);
  });
};
const restart = () => {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (electron) {
      electron.removeAllListeners('exit');
      electron.kill('SIGTERM');
    }
    launch();
  }, 300);
};
function shutdown(code) {
  builder.kill();
  void server.close().then(() => process.exit(code));
}

// Wait for the first bundle, then launch and watch for rebuilds.
const waitForBundle = setInterval(async () => {
  const { existsSync } = await import('node:fs');
  if (existsSync('dist/main/index.cjs') && existsSync('dist/preload/index.cjs')) {
    clearInterval(waitForBundle);
    launch();
    watch('dist/main', restart);
    watch('dist/preload', restart);
  }
}, 200);

process.on('SIGINT', () => shutdown(0));
