/**
 * <ConnectionStatusBanner /> — persistent WebSocket connectivity indicator.
 *
 * Reads the `isConnected` flag from the Zustand trade store and surfaces the
 * live connection state to the user. Behaviour (per ux-best-practices,
 * "Connection status"):
 *
 *  - Disconnected: renders a persistent, high-visibility "Disconnected" banner.
 *    State is conveyed by BOTH colour (red) AND explicit text so colour is
 *    never the sole indicator (accessibility requirement 8.6).
 *  - Reconnected: when the connection transitions from down to up, a brief
 *    "Connected" confirmation is shown, then it auto-hides after a short delay,
 *    leaving the blotter unobstructed during normal operation.
 *  - On first mount while already connected, nothing is shown (there is no
 *    prior disconnect to confirm recovery from).
 *
 * The outer wrapper is always mounted as an `aria-live="polite"`,
 * `role="status"` region so assistive technology announces every transition —
 * including the announcement region persisting when the banner is visually
 * empty.
 *
 * _Requirements: 8.6_
 */

import { useEffect, useRef, useState } from 'react';

import { useTradeStore } from '../store/trade.store';
import styles from './ConnectionStatusBanner.module.css';

/** How long the transient "Connected" confirmation stays visible (ms). */
const CONNECTED_CONFIRMATION_MS = 3000;

export function ConnectionStatusBanner(): React.JSX.Element {
  const isConnected = useTradeStore((state) => state.isConnected);

  // Whether to show the brief "Connected" confirmation. Only set when the
  // connection recovers from a previous disconnect — never on initial mount.
  const [showConnected, setShowConnected] = useState(false);

  // Tracks the previous connection value so we can detect the false -> true
  // transition (reconnect) without firing on the very first render.
  const wasConnectedRef = useRef<boolean>(isConnected);

  useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    wasConnectedRef.current = isConnected;

    // Reconnect edge: previously down, now up -> show brief confirmation.
    if (isConnected && !wasConnected) {
      setShowConnected(true);
      const timer = window.setTimeout(() => {
        setShowConnected(false);
      }, CONNECTED_CONFIRMATION_MS);
      return () => window.clearTimeout(timer);
    }

    // While disconnected the confirmation must never linger.
    if (!isConnected && showConnected) {
      setShowConnected(false);
    }

    return undefined;
  }, [isConnected, showConnected]);

  // The live region is ALWAYS rendered so screen readers can announce changes,
  // even when there is no visible banner content.
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {!isConnected && (
        <div className={`${styles.banner} ${styles.disconnected}`}>
          <span className={styles.dot} aria-hidden="true" />
          <span>Disconnected — attempting to reconnect…</span>
        </div>
      )}
      {isConnected && showConnected && (
        <div className={`${styles.banner} ${styles.connected}`}>
          <span className={styles.dot} aria-hidden="true" />
          <span>Connected</span>
        </div>
      )}
    </div>
  );
}
