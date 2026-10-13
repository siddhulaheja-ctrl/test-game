import { PEKKA } from './pekka';
import { registerSpecies } from './registry';

/** Built-in characters. Importing this module registers them; the first one is the default. */
export const BUILT_IN_SPECIES = [PEKKA] as const;

registerSpecies(PEKKA, { isDefault: true });
for (const s of BUILT_IN_SPECIES) registerSpecies(s);

export { getSpecies, listSpecies, registerSpecies } from './registry';
export type { SpeciesDef } from './types';
