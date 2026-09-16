/**
 * Shared Zod validation schemas for the create and amend trade forms. Client
 * rules mirror the backend edge validation field-for-field:
 *  - symbol: non-empty, uppercase `^[A-Z]+$`; whitespace-only treated as empty
 *  - quantity: integer >= 1
 *  - price: number > 0
 *  - side: BUY | SELL
 *  - trader / book / counterparty: non-empty (whitespace-only treated as empty)
 *  - status (amend only): ACTIVE | CANCELLED
 *
 * Empty numeric input is treated as MISSING (so the required rule fires) rather
 * than coerced to 0 (which would slip past a positive-number rule).
 */

import { z } from 'zod';

import { TradeSide, TradeStatus } from '../types/trade.types';

/** User-facing validation messages, referenced by tests and the form. */
export const VALIDATION_MESSAGES = {
  symbolRequired: 'Symbol is required.',
  symbolFormat: 'Symbol must be uppercase letters only.',
  quantityRequired: 'Quantity is required.',
  quantityInteger: 'Quantity must be a whole number of 1 or more.',
  priceRequired: 'Price is required.',
  pricePositive: 'Price must be greater than 0.',
  sideRequired: 'Side is required.',
  traderRequired: 'Trader is required.',
  bookRequired: 'Book is required.',
  counterpartyRequired: 'Counterparty is required.',
  statusInvalid: 'Status must be ACTIVE or CANCELLED.',
} as const;

/** Trims a string-ish input; non-strings pass through unchanged. */
function trimInput(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Coerces a numeric text input to a number, treating empty/whitespace-only as
 * `undefined` (missing) so the required rule fires — never coerced to 0.
 */
function toOptionalNumber(value: unknown): unknown {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return undefined;
    }
    const n = Number(trimmed);
    return Number.isNaN(n) ? value : n;
  }
  return value;
}

/** Required uppercase symbol. */
const symbolRequired = z.preprocess(
  trimInput,
  z
    .string({ required_error: VALIDATION_MESSAGES.symbolRequired })
    .min(1, VALIDATION_MESSAGES.symbolRequired)
    .regex(/^[A-Z]+$/, VALIDATION_MESSAGES.symbolFormat),
);

/** Required positive integer quantity. */
const quantityRequired = z.preprocess(
  toOptionalNumber,
  z
    .number({
      required_error: VALIDATION_MESSAGES.quantityRequired,
      invalid_type_error: VALIDATION_MESSAGES.quantityRequired,
    })
    .int(VALIDATION_MESSAGES.quantityInteger)
    .min(1, VALIDATION_MESSAGES.quantityInteger),
);

/** Required positive price. */
const priceRequired = z.preprocess(
  toOptionalNumber,
  z
    .number({
      required_error: VALIDATION_MESSAGES.priceRequired,
      invalid_type_error: VALIDATION_MESSAGES.priceRequired,
    })
    .gt(0, VALIDATION_MESSAGES.pricePositive),
);

/** Required side. */
const sideRequired = z.nativeEnum(TradeSide, {
  required_error: VALIDATION_MESSAGES.sideRequired,
  invalid_type_error: VALIDATION_MESSAGES.sideRequired,
});

/** Builds a required non-empty text field with a specific message. */
function requiredText(message: string): z.ZodEffects<z.ZodString, string, unknown> {
  return z.preprocess(
    trimInput,
    z.string({ required_error: message }).min(1, message),
  );
}

/** The validated create-form value shape (every field present). */
export interface CreateTradeFormValues {
  readonly symbol: string;
  readonly quantity: number;
  readonly price: number;
  readonly side: TradeSide;
  readonly trader: string;
  readonly book: string;
  readonly counterparty: string;
}

/** The raw create schema. */
const createSchemaRaw = z.object({
  symbol: symbolRequired,
  quantity: quantityRequired,
  price: priceRequired,
  side: sideRequired,
  trader: requiredText(VALIDATION_MESSAGES.traderRequired),
  book: requiredText(VALIDATION_MESSAGES.bookRequired),
  counterparty: requiredText(VALIDATION_MESSAGES.counterpartyRequired),
});

/** Optional uppercase symbol (amend). Empty is allowed (means "unchanged"). */
const symbolOptional = z.preprocess(
  trimInput,
  z
    .string()
    .regex(/^[A-Z]+$/, VALIDATION_MESSAGES.symbolFormat)
    .optional()
    .or(z.literal('').transform(() => undefined)),
);

/** Optional positive integer quantity (amend). */
const quantityOptional = z.preprocess(
  toOptionalNumber,
  z
    .number()
    .int(VALIDATION_MESSAGES.quantityInteger)
    .min(1, VALIDATION_MESSAGES.quantityInteger)
    .optional(),
);

/** Optional positive price (amend). */
const priceOptional = z.preprocess(
  toOptionalNumber,
  z.number().gt(0, VALIDATION_MESSAGES.pricePositive).optional(),
);

/** Optional non-empty text (amend); empty becomes undefined. */
function optionalText(): z.ZodEffects<z.ZodTypeAny, string | undefined, unknown> {
  return z.preprocess((v) => {
    const trimmed = trimInput(v);
    return trimmed === '' ? undefined : trimmed;
  }, z.string().min(1).optional());
}

/** Optional side (amend); empty becomes undefined. */
const sideOptional = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.nativeEnum(TradeSide).optional(),
);

/** Optional status (amend only); empty becomes undefined. */
const statusOptional = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.nativeEnum(TradeStatus, {
    invalid_type_error: VALIDATION_MESSAGES.statusInvalid,
  }).optional(),
);

/** The validated amend-form value shape (every field optional). */
export interface AmendTradeFormValues {
  readonly symbol?: string;
  readonly quantity?: number;
  readonly price?: number;
  readonly side?: TradeSide;
  readonly trader?: string;
  readonly book?: string;
  readonly counterparty?: string;
  readonly status?: TradeStatus;
}

/** The raw amend schema. */
const amendSchemaRaw = z.object({
  symbol: symbolOptional,
  quantity: quantityOptional,
  price: priceOptional,
  side: sideOptional,
  trader: optionalText(),
  book: optionalText(),
  counterparty: optionalText(),
  status: statusOptional,
});

/**
 * The exported schemas are typed against a shared value shape so a
 * `mode === 'create' ? createTradeSchema : amendTradeSchema` ternary collapses
 * to a single type the RHF zod resolver accepts, rather than widening into an
 * incompatible schema union. Runtime behaviour is unchanged; the specific
 * value shapes are exported separately for the modal consumers.
 */
type SharedFormValues = CreateTradeFormValues | AmendTradeFormValues;

/** Shared schema type; both inputs/outputs use it so the resolver stays typed. */
type SharedSchema = z.ZodType<SharedFormValues, z.ZodTypeDef, SharedFormValues>;

/** The create schema — every field required. */
export const createTradeSchema: SharedSchema =
  createSchemaRaw as unknown as SharedSchema;

/** The amend schema — every field optional (only supplied fields change). */
export const amendTradeSchema: SharedSchema =
  amendSchemaRaw as unknown as SharedSchema;
