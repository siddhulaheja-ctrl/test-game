import type { Pet } from './pet';

/** The behaviour states named in the spec; `state` on a behaviour reports one of these. */
export type BehaviorState =
  | 'idle'
  | 'walk'
  | 'sit'
  | 'sleep'
  | 'climb'
  | 'fall'
  | 'jump'
  | 'peek'
  | 'hide'
  | 'play'
  | 'react'
  | 'held';

/**
 * One thing a pet can be doing. A behaviour is created when chosen and dropped when it finishes,
 * so it can keep its own progress in fields.
 */
export interface Behavior {
  /** Short name for logs, tests and the debug overlay. */
  readonly name: string;
  /** Which spec state this is right now (a trip reports walk, jump or climb as it goes). */
  readonly state: BehaviorState;
  /** Cursor curiosity and fright may cut in (false for falling, being held, reacting…). */
  readonly interruptible: boolean;
  start(pet: Pet): void;
  /** Advance; return true when finished. */
  update(pet: Pet, dt: number): boolean;
  stop?(pet: Pet): void;
  /** The desktop changed under it (windows moved or closed). */
  worldChanged?(pet: Pet): void;
}

/** A choice the brain can make, with a weight that depends on the situation (0 = not now). */
export interface Option {
  name: string;
  weight(pet: Pet): number;
  create(pet: Pet): Behavior | null;
}

/**
 * Runs one behaviour at a time. When it finishes, plays anything queued, otherwise picks the next
 * from the options by weighted chance. `interrupt` replaces the current behaviour immediately.
 */
export class Brain {
  current: Behavior | null = null;
  private queue: Behavior[] = [];
  /** Seconds spent in the current behaviour. */
  elapsed = 0;
  /** Recent choices (newest last), for tests and the debug overlay. */
  readonly history: string[] = [];

  constructor(private readonly options: readonly Option[]) {}

  get state(): BehaviorState {
    return this.current?.state ?? 'idle';
  }

  /** Stop what it's doing and run these instead (in order). */
  interrupt(pet: Pet, ...next: Behavior[]): void {
    this.current?.stop?.(pet);
    this.current = null;
    this.queue = [...next];
    this.advance(pet);
  }

  /** Run these after the current behaviour finishes. */
  enqueue(...next: Behavior[]): void {
    this.queue.push(...next);
  }

  update(pet: Pet, dt: number): void {
    if (!this.current) this.advance(pet);
    if (!this.current) return;
    this.elapsed += dt;
    if (this.current.update(pet, dt)) {
      this.current.stop?.(pet);
      this.current = null;
      this.advance(pet);
    }
  }

  private advance(pet: Pet): void {
    const next = this.queue.shift() ?? this.choose(pet);
    this.current = next;
    this.elapsed = 0;
    if (!next) return;
    this.history.push(next.name);
    if (this.history.length > 40) this.history.shift();
    next.start(pet);
  }

  /** Weighted random pick among options that can run right now. */
  choose(pet: Pet): Behavior | null {
    const weighted = this.options
      .map((o) => ({ o, w: Math.max(0, o.weight(pet)) }))
      .filter((x) => x.w > 0);
    for (let tries = 0; tries < 4 && weighted.length; tries++) {
      const total = weighted.reduce((s, x) => s + x.w, 0);
      let r = pet.rng.next() * total;
      let pick = weighted[weighted.length - 1]!;
      for (const x of weighted) {
        r -= x.w;
        if (r <= 0) {
          pick = x;
          break;
        }
      }
      const b = pick.o.create(pet);
      if (b) return b;
      weighted.splice(weighted.indexOf(pick), 1);
    }
    return null;
  }
}
