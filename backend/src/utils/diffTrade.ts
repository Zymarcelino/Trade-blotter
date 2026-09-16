/**
 * Field-level diffing for trade amendments. Produces one {@link AuditInsert}
 * per field present in the update with a differing value (Requirements 7.1, 7.3).
 */
import type { AmendTradeRequest, AuditInsert, Trade } from '../types/trade.types';

/** The trade fields that are amendable and therefore auditable. */
export const AUDITABLE_FIELDS: readonly (keyof AmendTradeRequest)[] = [
  'symbol',
  'quantity',
  'price',
  'side',
  'trader',
  'status',
  'book',
  'counterparty',
];

const DEFAULT_CHANGED_BY = 'SYSTEM';

/**
 * Computes the audit inserts for a trade amendment. Fields absent from `update`
 * and fields whose value is unchanged are skipped, so a no-op yields `[]`.
 */
export function diffTrade(
  current: Readonly<Trade>,
  update: AmendTradeRequest,
): AuditInsert[] {
  const changedAt = new Date().toISOString();
  const entries: AuditInsert[] = [];

  for (const field of AUDITABLE_FIELDS) {
    const nextValue = update[field];
    if (nextValue === undefined) {
      continue;
    }
    const oldValue = String(current[field]);
    const newValue = String(nextValue);
    if (oldValue === newValue) {
      continue;
    }
    entries.push({
      tradeId: current.id,
      field,
      oldValue,
      newValue,
      changedAt,
      changedBy: DEFAULT_CHANGED_BY,
    });
  }

  return entries;
}
