import type { Creature } from '../creature';
import { drawParticles } from './drawParticles';
import { drawShadow } from './parts';

export { bodyOutline } from './parts';

/** Draw the creature (any species) and its particles at its current pose. */
export function drawCreature(ctx: CanvasRenderingContext2D, creature: Creature): void {
  const pose = creature.getPose();
  ctx.save();
  ctx.globalAlpha *= creature.alpha;
  drawShadow(ctx, creature, pose);
  creature.species.draw(ctx, creature, pose);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha *= creature.alpha;
  drawParticles(ctx, creature.particles.particles, creature.palette);
  ctx.restore();
}
