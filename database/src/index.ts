/**
 * Public surface of the database package: the SQLite connection factory,
 * schema migrations, seed routine, and the ITradeRepository implementation.
 * All SQL and snake_case row handling is encapsulated here.
 */
export { createConnection } from './connection';
export { runMigrations } from './migrations';
export {
  seedIfEmpty,
  generateSeedRow,
  SEED_SYMBOLS,
  SEED_TRADERS,
  SEED_BOOKS,
  SEED_COUNTERPARTIES,
} from './seed';
export { TradeRepository } from './trade.repository';