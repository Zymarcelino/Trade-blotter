# Steering: Domain Modelling

- Branded IDs: `TradeId = string & { __brand }`, produced only via `createTradeId()`.
- Use `const` objects + derived union types for enumerations (`TradeSide`, `TradeStatus`) - no `enum`.
- Domain objects are handled as `Readonly<Trade>` in service and store layers.
- DTOs are derived: `CreateTradeRequest = Omit<Trade,'id'|'tradeDate'|'status'>`,
  `AmendTradeRequest = Partial<Omit<Trade,'id'|'tradeDate'>>`.
- WebSocket messages are a discriminated union keyed on `type`.
- The domain types module is the single source of truth, mirrored on the frontend.
