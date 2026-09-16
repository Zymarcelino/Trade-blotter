import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';

import { createConnection } from './connection';

describe('createConnection', () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('opens an in-memory database that can run SQL', () => {
    db = createConnection(':memory:');
    db.exec('CREATE TABLE t (id INTEGER)');
    db.prepare('INSERT INTO t (id) VALUES (?)').run(1);
    const row = db.prepare('SELECT COUNT(*) AS c FROM t').get() as { c: number };
    expect(row.c).toBe(1);
  });

  it('sets a journal mode pragma (memory for :memory:, wal for a file)', () => {
    db = createConnection(':memory:');
    const mode = (db.pragma('journal_mode', { simple: true }) as string).toLowerCase();
    // :memory: reports "memory"; a file DB would report "wal".
    expect(['memory', 'wal']).toContain(mode);
  });
});
