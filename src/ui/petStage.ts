import type { Vec2 } from '../core/math';
import { CursorSense } from '../behaviors/cursorSense';
import { Pet, type PetSnapshot } from '../behaviors/pet';
import type { Appearance } from '../creature/appearance';
import { drawCreature } from '../creature/render/drawCreature';
import { World, type WorldSnapshot } from '../world/world';
import type { HitShape } from './interactivity';

/** Pointer travel (px) that turns a press on a pet into picking it up rather than a poke. */
const DRAG_START = 6;

export interface StageOptions {
  /** The display this view draws (an overlay); null draws everything (the playground). */
  displayId?: number | null;
  /** Called when a pet walks onto another display and must move to that display's overlay. */
  onHandoff?(snap: PetSnapshot, toDisplay: number): void;
}

/**
 * The pets living on one view of the desktop: owns the world, the cursor sense and the pets,
 * turns pointer input into pokes, drags and throws, and draws everything with the view's offset.
 * Used by the overlay windows and by the browser playground.
 */
export class PetStage {
  world = World.empty();
  readonly cursor = new CursorSense();
  readonly pets: Pet[] = [];
  quiet = false;
  /** Top-left of this view in desktop coordinates. */
  origin: Vec2 = { x: 0, y: 0 };
  displayId: number | null;
  private press: { pet: Pet; at: Vec2 } | null = null;
  private dragging: Pet | null = null;
  private nextSeed = 1;

  constructor(private readonly opts: StageOptions = {}) {
    this.displayId = opts.displayId ?? null;
  }

  setWorld(snap: WorldSnapshot): void {
    this.world = new World(snap);
    for (const p of this.pets) p.setWorld(this.world);
  }

  addPet(id: string, appearance: Partial<Appearance>, at?: Vec2, seed?: number): Pet {
    const pet = new Pet({
      id,
      appearance,
      seed: seed ?? this.nextSeed++ * 7919,
      world: this.world,
      cursor: this.cursor,
      x: at?.x,
      y: at?.y,
    });
    this.pets.push(pet);
    return pet;
  }

  adopt(snap: PetSnapshot): Pet {
    this.removePet(snap.id);
    const pet = Pet.restore(snap, this.world, this.cursor);
    this.pets.push(pet);
    if (snap.contact === 'held') this.dragging = pet;
    return pet;
  }

  removePet(id: string): void {
    const i = this.pets.findIndex((p) => p.id === id);
    if (i >= 0) this.pets.splice(i, 1);
    if (this.dragging?.id === id) this.dragging = null;
    if (this.press?.pet.id === id) this.press = null;
  }

  pet(id: string): Pet | undefined {
    return this.pets.find((p) => p.id === id);
  }

  update(dt: number): void {
    this.cursor.update(dt);
    for (const pet of this.pets) {
      const others = this.pets
        .filter((p) => p !== pet)
        .map((p) => ({ x: p.mover.x, y: p.mover.y }));
      pet.update(dt, { quiet: this.quiet, others });
    }
    if (this.displayId !== null && this.opts.onHandoff) {
      for (const pet of [...this.pets]) {
        const c = pet.center;
        const d = this.world.displayAt(c.x, c.y);
        if (d && d.id !== this.displayId) {
          this.opts.onHandoff(pet.snapshot(), d.id);
          this.removePet(pet.id);
        }
      }
    }
  }

  /** How much is moving (for the adaptive frame rate). */
  activity(): number {
    let a = 0;
    for (const p of this.pets) {
      a += p.creature.activity();
      if (p.mover.walkSpeed > 0 || p.mover.contact.kind !== 'surface') a += 10;
    }
    return a;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(-this.origin.x, -this.origin.y);
    for (const p of this.pets) if (!p.hidden) drawCreature(ctx, p.creature);
    ctx.restore();
  }

  /** The pet under a desktop point, if any (top-most drawn last). */
  petAt(p: Vec2, margin = 0): Pet | null {
    for (let i = this.pets.length - 1; i >= 0; i--) {
      const pet = this.pets[i]!;
      if (pet.hidden) continue;
      if (pet.creature.hitShape().distanceOutside(p.x, p.y) <= margin) return pet;
    }
    return null;
  }

  /** Union of the pets' hit shapes, in this view's coordinates (for click-through). */
  hitShape(): HitShape {
    const o = this.origin;
    return {
      distanceOutside: (x, y) => {
        if (this.dragging) return -1;
        let best = Infinity;
        for (const p of this.pets) {
          if (p.hidden) continue;
          best = Math.min(best, p.creature.hitShape().distanceOutside(x + o.x, y + o.y));
        }
        return best;
      },
    };
  }

  get isDragging(): boolean {
    return this.dragging !== null;
  }

  // --- Pointer input (desktop coordinates) -------------------------------------------------------

  pointerMove(p: Vec2): void {
    this.cursor.feed(p);
    if (this.press && !this.dragging) {
      if (Math.hypot(p.x - this.press.at.x, p.y - this.press.at.y) > DRAG_START) {
        this.dragging = this.press.pet;
        this.dragging.grab(this.press.at);
      }
    }
    this.dragging?.drag(p);
  }

  /** Returns true if the press landed on a pet. */
  pointerDown(p: Vec2): boolean {
    const pet = this.petAt(p, 2);
    if (!pet) return false;
    this.press = { pet, at: { ...p } };
    return true;
  }

  pointerUp(p: Vec2): void {
    if (this.dragging) {
      this.dragging.drag(p);
      this.dragging.release();
    } else if (this.press) {
      this.press.pet.poke(p);
    }
    this.dragging = null;
    this.press = null;
  }
}
