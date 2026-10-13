/**
 * Versioned persistence helpers (pure, no IO).
 * A saved document is `{ version, data }`. Migrations step the data forward one version at a time.
 */

export interface Envelope<T> {
  version: number;
  savedAt: string;
  data: T;
}

export interface Migration {
  /** Version this migration upgrades from (to `from + 1`). */
  from: number;
  migrate(data: unknown): unknown;
}

export class MigrationError extends Error {}

/** Run migrations from `fromVersion` up to `toVersion`. Throws if a step is missing. */
export function runMigrations(
  data: unknown,
  fromVersion: number,
  toVersion: number,
  migrations: readonly Migration[],
): unknown {
  if (fromVersion > toVersion) {
    throw new MigrationError(
      `Saved data is version ${fromVersion}, newer than this app (version ${toVersion}).`,
    );
  }
  let current = data;
  for (let v = fromVersion; v < toVersion; v++) {
    const step = migrations.find((m) => m.from === v);
    if (!step) throw new MigrationError(`No migration from version ${v} to ${v + 1}.`);
    current = step.migrate(current);
  }
  return current;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge saved data over defaults: keys missing from `saved` take the default, and values whose
 * type does not match the default are dropped. Arrays and primitives replace wholesale.
 */
export function mergeWithDefaults<T>(defaults: T, saved: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(saved)) {
    if (saved === undefined) return defaults;
    if (Array.isArray(defaults)) return (Array.isArray(saved) ? saved : defaults) as T;
    return (typeof saved === typeof defaults ? saved : defaults) as T;
  }
  const out: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    out[key] = mergeWithDefaults((defaults as Record<string, unknown>)[key], saved[key]);
  }
  // Keep extra keys that defaults do not mention (forward compatibility for plugin data).
  for (const key of Object.keys(saved)) {
    if (!(key in out)) out[key] = saved[key];
  }
  return out as T;
}

/** Parse a stored envelope, migrate it, and merge with defaults. */
export function decodeEnvelope<T>(
  raw: string,
  currentVersion: number,
  defaults: T,
  migrations: readonly Migration[],
): T {
  const parsed: unknown = JSON.parse(raw);
  if (!isPlainObject(parsed) || typeof parsed.version !== 'number' || !('data' in parsed)) {
    throw new MigrationError('File is not a Desktop Buddy save envelope.');
  }
  const migrated = runMigrations(parsed.data, parsed.version, currentVersion, migrations);
  return mergeWithDefaults(defaults, migrated);
}

export function encodeEnvelope<T>(data: T, version: number, now: Date = new Date()): string {
  const env: Envelope<T> = { version, savedAt: now.toISOString(), data };
  return JSON.stringify(env, null, 2);
}
