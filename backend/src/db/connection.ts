/**
 * SQLite connection factory. The single place a better-sqlite3 Database is
 * opened; WAL mode is enabled so readers do not block the single writer.
 */
import Database from 'better-sqlite3';

/**
 * Opens a better-sqlite3 connection at the given path and enables WAL mode.
 * The special path `:memory:` opens a transient in-memory database (tests).
 */
export function createConnection(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}
