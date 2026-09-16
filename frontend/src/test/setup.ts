/**
 * Vitest setup — runs before every test file.
 *
 *  - Registers @testing-library/jest-dom matchers.
 *  - Stubs ResizeObserver (absent in jsdom) so TanStack Virtual can measure the
 *    scroll container. The stub reports a ~800px content box on observe, which
 *    is enough for the virtualizer to compute a usable window of rows.
 *
 * It deliberately does NOT override getBoundingClientRect or offsetHeight
 * globally, which would interfere with other components' layout assumptions.
 */

import '@testing-library/jest-dom/vitest';

/** A minimal ResizeObserver that reports a fixed ~800px box on observe. */
class ResizeObserverStub implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    // TanStack Virtual reads the observed size from `entry.borderBoxSize[0]`
    // (blockSize/inlineSize), falling back to element.offsetHeight only when
    // that is absent. jsdom reports offsetHeight as 0, so we must report a real
    // border box here (~800px tall) for the virtualizer to window in rows —
    // without touching getBoundingClientRect/offsetHeight globally.
    const size: ResizeObserverSize = { inlineSize: 1200, blockSize: 800 };
    const entry = {
      target,
      contentRect: {
        width: 1200,
        height: 800,
        top: 0,
        left: 0,
        right: 1200,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRectReadOnly,
      borderBoxSize: [size],
      contentBoxSize: [size],
      devicePixelContentBoxSize: [size],
    } as ResizeObserverEntry;
    this.callback([entry], this);
  }

  unobserve(): void {
    // no-op
  }

  disconnect(): void {
    // no-op
  }
}

globalThis.ResizeObserver = ResizeObserverStub;
