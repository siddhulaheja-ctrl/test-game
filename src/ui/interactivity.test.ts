import { describe, expect, it } from 'vitest';
import { InteractivityTracker, ellipseHit } from './interactivity';

describe('InteractivityTracker', () => {
  const shape = ellipseHit(100, 100, 40, 30);

  it('turns interactive over the creature and back to click-through away from it', () => {
    const changes: boolean[] = [];
    const t = new InteractivityTracker((v) => changes.push(v));
    t.update({ x: 500, y: 500 }, shape);
    t.update({ x: 100, y: 100 }, shape);
    t.update({ x: 500, y: 500 }, shape);
    expect(changes).toEqual([true, false]);
  });

  it('uses hysteresis at the edge', () => {
    const t = new InteractivityTracker(() => {});
    t.update({ x: 145, y: 100 }, shape); // 5px outside: not yet
    expect(t.isInteractive).toBe(false);
    t.update({ x: 139, y: 100 }, shape); // inside
    t.update({ x: 145, y: 100 }, shape); // 5px outside: still interactive
    expect(t.isInteractive).toBe(true);
    t.update({ x: 160, y: 100 }, shape); // 20px outside: release
    expect(t.isInteractive).toBe(false);
  });

  it('hold keeps it interactive (dragging)', () => {
    const t = new InteractivityTracker(() => {});
    t.hold = true;
    t.update({ x: 999, y: 999 }, shape);
    expect(t.isInteractive).toBe(true);
    t.reset();
    expect(t.isInteractive).toBe(false);
  });
});
