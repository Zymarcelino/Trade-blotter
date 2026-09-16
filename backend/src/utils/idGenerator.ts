/**
 * Trade identifier generation. Format `TRD-XXXXXX`: prefix `TRD-` plus the
 * sequence number zero-padded to at least 6 digits (Requirement 2.3).
 */
import { createTradeId, type TradeId } from '../types/trade.types';

const TRADE_ID_PREFIX = 'TRD-';
const SEQUENCE_WIDTH = 6;

/**
 * Builds a branded {@link TradeId} from a numeric sequence.
 * @throws {RangeError} If `sequence` is not finite or is negative.
 */
export function generateTradeId(sequence: number): TradeId {
  if (!Number.isFinite(sequence) || sequence < 0) {
    throw new RangeError(
      `generateTradeId requires a finite, non-negative sequence, received: ${sequence}`,
    );
  }
  const padded = Math.floor(sequence).toString().padStart(SEQUENCE_WIDTH, '0');
  return createTradeId(`${TRADE_ID_PREFIX}${padded}`);
}
