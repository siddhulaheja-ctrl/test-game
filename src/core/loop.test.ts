import { describe, expect, it } from 'vitest';
import { Loop, type FrameScheduler } from './loop';

function fakeScheduler() {
  let t = 0;
  let pending: (() => void) | null = null;
  const sched: FrameScheduler = {
    now: () => t,
    request: (cb) => {
      pending = cb;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
  };
  return {
    sched,
    /** Run frames at a fixed interval (ms). */
    run(frames: number, intervalMs: number) {
      for (let i = 0; i < frames; i++) {
        t += intervalMs;
        const cb = pending;
        pending = null;
        cb?.();
      }
    },
  };
}

describe('Loop', () => {
  it('runs a fixed number of updates per simulated second', () => {
    const fake = fakeScheduler();
    let updates = 0;
    const loop = new Loop({ update: () => updates++, render: () => {}, scheduler: fake.sched });
    loop.start();
    fake.run(60, 1000 / 60);
    expect(updates).toBeGreaterThanOrEqual(59);
    expect(updates).toBeLessThanOrEqual(61);
  });

  it('presents fewer frames when idle', () => {
    const fake = fakeScheduler();
    let renders = 0;
    let active = true;
    const loop = new Loop({
      update: () => {
        if (active) loop.markActive();
      },
      render: () => renders++,
      idleFps: 15,
      idleAfter: 0.5,
      scheduler: fake.sched,
    });
    loop.start();
    fake.run(60, 1000 / 60);
    const activeRenders = renders;
    active = false;
    fake.run(60, 1000 / 60); // first 0.5s still counts as active
    renders = 0;
    fake.run(60, 1000 / 60);
    expect(activeRenders).toBeGreaterThan(55);
    expect(loop.isIdle).toBe(true);
    expect(renders).toBeLessThanOrEqual(16);
  });

  it('pause() stops ticking and advance() steps deterministically', () => {
    const fake = fakeScheduler();
    let updates = 0;
    const loop = new Loop({ update: () => updates++, render: () => {}, scheduler: fake.sched });
    loop.start();
    loop.pause();
    fake.run(10, 16);
    expect(updates).toBe(0);
    loop.advance(1);
    expect(updates).toBe(60);
  });
});
