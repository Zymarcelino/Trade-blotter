/**
 * Domain types for the trade blotter.
 *
 * The single source of truth now lives in the `@trade-blotter/shared` package
 * so the `database` package and this backend can both depend on it without an
 * import cycle. This module re-exports that surface so existing backend imports
 * (`../types/trade.types`) keep working unchanged; the frontend mirrors it.
 */
export * from '@trade-blotter/shared';