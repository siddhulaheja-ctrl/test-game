import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonStore } from './jsonStore';

describe('JsonStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glorp-store-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const make = () =>
    new JsonStore({ file: path.join(dir, 's.json'), version: 1, defaults: { n: 0 }, backups: 2 });

  it('returns defaults when nothing is saved, then round-trips', () => {
    const s = make();
    expect(s.load()).toEqual({ n: 0 });
    s.save({ n: 5 });
    expect(make().load()).toEqual({ n: 5 });
  });

  it('keeps rotating backups and recovers from a corrupt file', () => {
    const s = make();
    s.save({ n: 1 });
    s.load(); // backup 1 = n:1
    s.save({ n: 2 });
    s.load(); // backup 1 = n:2, backup 2 = n:1
    fs.writeFileSync(s.file, '{ not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(make().load()).toEqual({ n: 2 });
    warn.mockRestore();
  });

  it('leaves no temp files behind', () => {
    make().save({ n: 3 });
    expect(fs.readdirSync(dir)).toEqual(['s.json']);
  });
});
