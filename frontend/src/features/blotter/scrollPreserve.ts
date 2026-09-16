/**
 * Pure scroll-position preservation for live prepends.
 *
 * New trades insert at the top of the blotter, so the scroll container grows in
 * height and everything below shifts down. To keep the rows a user is reading
 * visually fixed, we add the height GROWTH back onto `scrollTop` — but only when
 * the user has scrolled away from the very top. At the top we leave the view as
 * is (no pin, no auto-scroll), so the newest rows appear naturally.
 */

/** Threshold (px) within which we treat the container as "at the top". */
const AT_TOP_THRESHOLD = 4;

/**
 * Returns the adjusted scrollTop after a content-height change.
 *
 * @param prevHeight the container scrollHeight before the update
 * @param nextHeight the container scrollHeight after the update
 * @param scrollTop  the current scrollTop
 */
export function computeScrollAdjustment(
  prevHeight: number,
  nextHeight: number,
  scrollTop: number,
): number {
  // At (or near) the top: keep showing the newest rows, do not shift.
  if (scrollTop <= AT_TOP_THRESHOLD) {
    return scrollTop;
  }
  const growth = nextHeight - prevHeight;
  if (growth <= 0) {
    return scrollTop;
  }
  return scrollTop + growth;
}
