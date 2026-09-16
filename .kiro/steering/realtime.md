# Steering: Real-time

- Native `ws` on the backend, browser `WebSocket` on the client. No Socket.IO.
- Upgrade only on `/ws` (same port as the API via the HTTP `upgrade` event); 404 others.
- Send `CONNECTION_ACK` on connect. Server-to-client only; ignore inbound client messages.
- Broadcast the affected trade after each successful mutation; nothing on failure.
- A per-client send failure must not block delivery to other clients.
- Client reconnect: bounded exponential backoff `min(1000 * 2^(n-1), 30000)`.
- Unknown message types are logged and must not mutate the store.
