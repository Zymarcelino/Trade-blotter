-- Seed data reference (Trade Blotter)
--
-- The application seeds 500 randomised trades on first startup when the
-- `trades` table is empty (a no-op once rows exist). The authoritative
-- generator is backend/src/db/seed.ts; this file documents WHAT it produces so
-- the database/ deliverable is self-contained, and gives a small illustrative
-- INSERT you can run by hand against schema.sql.
--
-- Generation rules (see seed.ts):
--   count            : 500 rows
--   id               : TRD-100001 .. TRD-100500 (sequential)
--   symbol           : one of AAPL, MSFT, TSLA, GOOGL, AMZN, META, NVDA, JPM, GS, BAC
--   quantity         : integer 100 .. 10000
--   price            : 10.00 .. 1000.00 (2 decimals)
--   side             : BUY or SELL
--   trader           : one of JSMITH, ABROWN, MJONES, LWILSON, KDAVIS, RMARTIN
--   book             : one of EQUITIES_UK, EQUITIES_US, TECH_GROWTH, FIXED_INCOME, EM_DESK
--   counterparty     : one of Goldman Sachs, JP Morgan, Morgan Stanley, Barclays,
--                      Deutsche Bank, Citi, UBS
--   trade_date       : ISO 8601, within the last 30 days
--   status           : ~10% CANCELLED, remainder ACTIVE
--
-- Illustrative rows (values chosen to satisfy every CHECK constraint):
INSERT INTO trades (id, symbol, quantity, price, side, trader, trade_date, status, book, counterparty) VALUES
  ('TRD-100001', 'AAPL',  1200, 187.42, 'BUY',  'JSMITH',  '2024-05-01T09:30:00.000Z', 'ACTIVE',    'EQUITIES_US', 'Goldman Sachs'),
  ('TRD-100002', 'MSFT',   500, 412.10, 'SELL', 'ABROWN',  '2024-05-02T14:15:00.000Z', 'ACTIVE',    'TECH_GROWTH', 'JP Morgan'),
  ('TRD-100003', 'TSLA',  3000, 178.55, 'BUY',  'MJONES',  '2024-05-03T11:05:00.000Z', 'CANCELLED', 'EQUITIES_US', 'Morgan Stanley');