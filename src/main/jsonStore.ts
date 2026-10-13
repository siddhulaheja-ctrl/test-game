import fs from 'node:fs';
import path from 'node:path';
import { decodeEnvelope, encodeEnvelope, type Migration } from '../core/persist/versioned';

export interface JsonStoreOptions<T> {
  file: string;
  version: number;
  defaults: T;
  migrations?: readonly Migration[];
  /** Number of rotating backups kept next to the file. */
  backups?: number;
}

/**
 * A versioned JSON document on disk.
 * - Writes are atomic: write to a temp file, then rename over the target.
 * - On load, the previous good file is rotated into `.bak.1 … .bak.N`.
 * - If the main file is corrupt, the newest readable backup is used instead.
 */
export class JsonStore<T> {
  private readonly opts: Required<JsonStoreOptions<T>>;

  constructor(opts: JsonStoreOptions<T>) {
    this.opts = { migrations: [], backups: 3, ...opts };
  }

  get file(): string {
    return this.opts.file;
  }

  private backupPath(n: number): string {
    return `${this.opts.file}.bak.${n}`;
  }

  private tryRead(file: string): T | undefined {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      return decodeEnvelope(raw, this.opts.version, this.opts.defaults, this.opts.migrations);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[store] could not read ${path.basename(file)}:`, (err as Error).message);
      }
      return undefined;
    }
  }

  private rotateBackups(): void {
    const { backups, file } = this.opts;
    if (backups <= 0 || !fs.existsSync(file)) return;
    for (let i = backups - 1; i >= 1; i--) {
      const src = this.backupPath(i);
      if (fs.existsSync(src)) fs.renameSync(src, this.backupPath(i + 1));
    }
    fs.copyFileSync(file, this.backupPath(1));
  }

  /** Load the document, falling back to backups and then defaults. */
  load(): T {
    const main = this.tryRead(this.opts.file);
    if (main !== undefined) {
      try {
        this.rotateBackups();
      } catch (err) {
        console.warn('[store] backup rotation failed:', (err as Error).message);
      }
      return main;
    }
    for (let i = 1; i <= this.opts.backups; i++) {
      const fromBackup = this.tryRead(this.backupPath(i));
      if (fromBackup !== undefined) {
        console.warn(`[store] restored ${path.basename(this.opts.file)} from backup ${i}`);
        return fromBackup;
      }
    }
    return structuredClone(this.opts.defaults);
  }

  save(data: T): void {
    const { file, version } = this.opts;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, encodeEnvelope(data, version), 'utf8');
    fs.renameSync(tmp, file);
  }
}
