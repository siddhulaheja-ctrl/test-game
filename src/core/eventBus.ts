/**
 * Typed event bus.
 * `Events` maps event names to payload types. Plugins extend the app's map via declaration merging.
 */

export type Listener<P> = (payload: P) => void;
export type AnyListener<E> = <K extends keyof E>(name: K, payload: E[K]) => void;

export class EventBus<E extends object> {
  private listeners = new Map<keyof E, Set<Listener<never>>>();
  private anyListeners = new Set<AnyListener<E>>();

  on<K extends keyof E>(name: K, fn: Listener<E[K]>): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(fn as Listener<never>);
    return () => this.off(name, fn);
  }

  once<K extends keyof E>(name: K, fn: Listener<E[K]>): () => void {
    const off = this.on(name, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends keyof E>(name: K, fn: Listener<E[K]>): void {
    this.listeners.get(name)?.delete(fn as Listener<never>);
  }

  /** Listen to every event (for the event inspector and plugin bridges). */
  onAny(fn: AnyListener<E>): () => void {
    this.anyListeners.add(fn);
    return () => this.anyListeners.delete(fn);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.listeners.get(name);
    if (set) {
      // Copy so listeners can unsubscribe while being called.
      for (const fn of [...set]) {
        try {
          (fn as Listener<E[K]>)(payload);
        } catch (err) {
          console.error(`[bus] listener for "${String(name)}" threw`, err);
        }
      }
    }
    for (const fn of [...this.anyListeners]) {
      try {
        fn(name, payload);
      } catch (err) {
        console.error('[bus] onAny listener threw', err);
      }
    }
  }

  listenerCount(name: keyof E): number {
    return this.listeners.get(name)?.size ?? 0;
  }

  clear(): void {
    this.listeners.clear();
    this.anyListeners.clear();
  }
}
