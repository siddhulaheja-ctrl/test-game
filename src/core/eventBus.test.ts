import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './eventBus';

interface Events {
  ping: number;
  hello: { name: string };
}

describe('EventBus', () => {
  it('delivers typed payloads to listeners', () => {
    const bus = new EventBus<Events>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.emit('ping', 3);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('unsubscribes via the returned function and off()', () => {
    const bus = new EventBus<Events>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on('ping', a);
    bus.on('ping', b);
    offA();
    bus.off('ping', b);
    bus.emit('ping', 1);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('once() fires a single time', () => {
    const bus = new EventBus<Events>();
    const fn = vi.fn();
    bus.once('ping', fn);
    bus.emit('ping', 1);
    bus.emit('ping', 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onAny sees every event', () => {
    const bus = new EventBus<Events>();
    const seen: string[] = [];
    bus.onAny((name) => seen.push(String(name)));
    bus.emit('ping', 1);
    bus.emit('hello', { name: 'g' });
    expect(seen).toEqual(['ping', 'hello']);
  });

  it('keeps going when a listener throws', () => {
    const bus = new EventBus<Events>();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', after);
    bus.emit('ping', 1);
    expect(after).toHaveBeenCalled();
    spy.mockRestore();
  });
});
