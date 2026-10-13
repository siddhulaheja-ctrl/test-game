import { GLORP } from './glorp';
import { PEKKA } from './pekka';
import { registerSpecies } from './registry';

/** Built-in species. Importing this module registers them. */
export const BUILT_IN_SPECIES = [GLORP, PEKKA] as const;

registerSpecies(GLORP, { isDefault: true });
for (const s of BUILT_IN_SPECIES) registerSpecies(s);

export { getSpecies, listSpecies, registerSpecies } from './registry';
export type { SpeciesDef } from './types';
