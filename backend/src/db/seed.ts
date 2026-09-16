/**
 * Seed data generation. On first startup {@link seedIfEmpty} populates the
 * `trades` table with 500 randomised trades (Requirement 2.2); it is a no-op
 * when the table already has rows (Requirement 2.6). IDs run TRD-100001..
 * TRD-100500. All inserts run in a single transaction.
 */
import type Database from 'better-sqlite3';

import { generateTradeId } from '../utils/idGenerator';
import { TradeSide, TradeStatus } from '../types/trade.types';

const SEED_COUNT = 500;
const SEED_START_SEQUENCE = 100001;

export const SEED_SYMBOLS = [
  'AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'META', 'NVDA', 'JPM', 'GS', 'BAC',
] as const;

export const SEED_TRADERS = [
  'JSMITH', 'ABROWN', 'MJONES', 'LWILSON', 'KDAVIS', 'RMARTIN',
] as const;

export const SEED_BOOKS = [
  'EQUITIES_UK', 'EQUITIES_US', 'TECH_GROWTH', 'FIXED_INCOME', 'EM_DESK',
] as const;

export const SEED_COUNTERPARTIES = [
  'Goldman Sachs', 'JP Morgan', 'Morgan Stanley', 'Barclays', 'Deutsche Bank', 'Citi', 'UBS',
] as const;

const MIN_QUANTITY = 100;
const MAX_QUANTITY = 10_000;
const MIN_PRICE = 10.0;
const MAX_PRICE = 1_000.0;
const TRADE_DATE_WINDOW_DAYS = 30;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const CANCELLED_RATIO = 0.1;

interface SeedRow {
  id: string;
  symbol: string;
  quantity: number;
  price: number;
  side: string;
  trader: string;
  trade_date: string;
  status: string;
  book: string;
  counterparty: string;
}

function pick<T>(values: readonly T[]): T {
  const index = Math.floor(Math.random() * values.length);
  return values[index] as T;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice(): number {
  const raw = Math.random() * (MAX_PRICE - MIN_PRICE) + MIN_PRICE;
  return Math.round(raw * 100) / 100;
}

function randomTradeDate(): string {
  const now = Date.now();
  const offset = Math.floor(Math.random() * TRADE_DATE_WINDOW_DAYS * MILLIS_PER_DAY);
  return new Date(now - offset).toISOString();
}

/** Builds a single randomised seed row for the given sequence number. */
export function generateSeedRow(sequence: number): SeedRow {
  return {
    id: generateTradeId(sequence),
    symbol: pick(SEED_SYMBOLS),
    quantity: randomInt(MIN_QUANTITY, MAX_QUANTITY),
    price: randomPrice(),
    side: pick([TradeSide.BUY, TradeSide.SELL]),
    trader: pick(SEED_TRADERS),
    trade_date: randomTradeDate(),
    status: Math.random() < CANCELLED_RATIO ? TradeStatus.CANCELLED : TradeStatus.ACTIVE,
    book: pick(SEED_BOOKS),
    counterparty: pick(SEED_COUNTERPARTIES),
  };
}

/** Seeds 500 trades when the `trades` table is empty; otherwise no-op. */
export function seedIfEmpty(db: Database.Database): void {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM trades').get() as { count: number };
  if (count > 0) {
    return;
  }

  const insert = db.prepare(
    `INSERT INTO trades (id, symbol, quantity, price, side, trader, trade_date, status, book, counterparty)
     VALUES (@id, @symbol, @quantity, @price, @side, @trader, @trade_date, @status, @book, @counterparty)`,
  );

  const insertAll = db.transaction((rows: SeedRow[]) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  const rows: SeedRow[] = [];
  for (let i = 0; i < SEED_COUNT; i += 1) {
    rows.push(generateSeedRow(SEED_START_SEQUENCE + i));
  }
  insertAll(rows);
}
