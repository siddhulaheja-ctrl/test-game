/**
 * Fixed-timestep simulation loop with rendering on animation frames.
 *
 * - `update(dt)` always runs with `dt = 1 / stepHz`, so physics is stable and deterministic.
 * - `render(alpha)` runs once per presented frame.
 * - The presented frame rate adapts: callers report activity, and when nothing is moving the loop
 *   presents fewer frames (`idleFps`) to save CPU. `pause()` stops everything (window hidden).
 */

export interface FrameScheduler {
  now(): number; // ms
  request(cb: () => void): number;
  cancel(handle: number): void;
}

export const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h),
};

export interface LoopOptions {
  update(dt: number): void;
  render(alpha: number): void;
  stepHz?: number;
  activeFps?: number;
  idleFps?: number;
  /** Seconds without reported activity before dropping to idle fps. */
  idleAfter?: number;
  scheduler?: FrameScheduler;
}

export class Loop {
  private readonly step: number;
  private readonly sched: FrameScheduler;
  private handle: number | null = null;
  private last = 0;
  private acc = 0;
  private lastPresented = 0;
  private quietTime = 0;
  private frames = 0;
  private fpsWindowStart = 0;
  /** Presented frames per second, measured over the last second. */
  fps = 0;

  constructor(private opts: LoopOptions) {
    this.step = 1 / (opts.stepHz ?? 60);
    this.sched = opts.scheduler ?? browserScheduler;
  }

  get running(): boolean {
    return this.handle !== null;
  }

  get isIdle(): boolean {
    return this.quietTime >= (this.opts.idleAfter ?? 2);
  }

  /** Report that something visible changed this step (keeps the loop at full frame rate). */
  markActive(): void {
    this.quietTime = 0;
  }

  start(): void {
    if (this.handle !== null) return;
    this.last = this.sched.now();
    this.lastPresented = 0;
    this.fpsWindowStart = this.last;
    this.frames = 0;
    this.handle = this.sched.request(this.tick);
  }

  pause(): void {
    if (this.handle !== null) this.sched.cancel(this.handle);
    this.handle = null;
    this.acc = 0;
  }

  /** Advance the simulation by exactly `seconds` (tests, screenshot freezing). */
  advance(seconds: number): void {
    const steps = Math.round(seconds / this.step);
    for (let i = 0; i < steps; i++) this.opts.update(this.step);
    this.opts.render(0);
  }

  private tick = (): void => {
    const now = this.sched.now();
    // Clamp long gaps (sleep/wake, debugger) so we don't spiral trying to catch up.
    const elapsed = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.acc += elapsed;
    this.quietTime += elapsed;

    while (this.acc >= this.step) {
      this.opts.update(this.step);
      this.acc -= this.step;
    }

    const targetFps = this.isIdle ? (this.opts.idleFps ?? 20) : (this.opts.activeFps ?? 60);
    // Allow ~2ms of jitter so a 60 fps target isn't rounded down to 30 by vsync timing.
    if (now - this.lastPresented >= 1000 / targetFps - 2) {
      this.lastPresented = now;
      this.opts.render(this.acc / this.step);
      this.frames++;
    }

    if (now - this.fpsWindowStart >= 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsWindowStart);
      this.frames = 0;
      this.fpsWindowStart = now;
    }

    if (this.handle !== null) this.handle = this.sched.request(this.tick);
  };
}
