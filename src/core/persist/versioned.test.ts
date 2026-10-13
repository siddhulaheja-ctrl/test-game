import { describe, expect, it } from 'vitest';
import { decodeEnvelope, encodeEnvelope, mergeWithDefaults, runMigrations } from './versioned';

describe('versioned persistence', () => {
  const defaults = { a: 1, nested: { b: true, c: 'x' }, list: [1, 2] };

  it('fills missing keys from defaults and drops wrong types', () => {
    const merged = mergeWithDefaults(defaults, { a: 'oops', nested: { b: false }, extra: 5 });
    expect(merged).toEqual({ a: 1, nested: { b: false, c: 'x' }, list: [1, 2], extra: 5 });
  });

  it('runs migrations in order', () => {
    const migrations = [
      { from: 1, migrate: (d: unknown) => ({ ...(d as object), v2: true }) },
      { from: 2, migrate: (d: unknown) => ({ ...(d as object), v3: true }) },
    ];
    expect(runMigrations({}, 1, 3, migrations)).toEqual({ v2: true, v3: true });
  });

  it('rejects data from a newer version and missing steps', () => {
    expect(() => runMigrations({}, 4, 3, [])).toThrow(/newer/);
    expect(() => runMigrations({}, 1, 2, [])).toThrow(/No migration/);
  });

  it('round-trips an envelope', () => {
    const raw = encodeEnvelope({ a: 9 }, 1);
    expect(decodeEnvelope(raw, 1, defaults, [])).toEqual({ ...defaults, a: 9 });
  });
});
