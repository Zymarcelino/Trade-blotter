/**
 * Presentation formatters. Pure functions used across the blotter, forms, and
 * audit panel so formatting is consistent and unit-testable.
 */

import type { TradeId } from '../types/trade.types';

/**
 * Formats an ISO 8601 timestamp as human-readable local time, e.g.
 * `"18 Aug 2026, 10:32:00"`. Never returns a raw ISO string (no `T`/`Z`
 * separators). Invalid input is returned unchanged rather than surfacing
 * "Invalid Date" to the user (design Property 23).
 */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/** Formats a number with exactly two decimal places (no currency symbol). */
export function formatCurrency(value: number): string {
  return value.toFixed(2);
}

/** Formats a trade id for display (identity today; a seam for future masking). */
export function formatTradeId(id: TradeId): string {
  return id;
}
