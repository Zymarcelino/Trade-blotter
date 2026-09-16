/**
 * Mock desk reference data for the create/amend trade form dropdowns. There is
 * no auth or user directory in this exercise, so the trader/book/counterparty
 * option lists are fixed, representative sets drawn from typical desk data.
 */

/** Trader ids offered in the form. */
export const TRADER_OPTIONS: readonly string[] = [
  'JSMITH',
  'ABROWN',
  'MPATEL',
  'RGARCIA',
  'KTANAKA',
  'LMUELLER',
];

/** Trading book codes offered in the form. */
export const BOOK_OPTIONS: readonly string[] = [
  'EQUITIES_US',
  'EQUITIES_EU',
  'EQUITIES_APAC',
  'RATES',
  'CREDIT',
  'FX',
];

/** Counterparty names offered in the form. */
export const COUNTERPARTY_OPTIONS: readonly string[] = [
  'Goldman Sachs',
  'Morgan Stanley',
  'JP Morgan',
  'Barclays',
  'Deutsche Bank',
  'UBS',
];
