import type { SpeciesDef } from './types';

/**
 * Species registry. Built-in species register themselves from `species/index.ts`; plugins will
 * register more through the same call.
 */
const registry = new Map<string, SpeciesDef>();
let defaultId = 'glorp';

export function registerSpecies(def: SpeciesDef, opts: { isDefault?: boolean } = {}): void {
  registry.set(def.id, def);
  if (opts.isDefault) defaultId = def.id;
}

export function getSpecies(id: string | undefined): SpeciesDef {
  const def = (id && registry.get(id)) || registry.get(defaultId);
  if (!def) throw new Error('No species registered (import creature/species first).');
  return def;
}

export function hasSpecies(id: unknown): id is string {
  return typeof id === 'string' && registry.has(id);
}

export function listSpecies(): SpeciesDef[] {
  return [...registry.values()];
}

export function defaultSpeciesId(): string {
  return defaultId;
}
