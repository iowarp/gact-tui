/**
 * Whether hover-only controls can wait for the pointer or focus to reach their
 * row before mounting. Devices without hover show those controls at once.
 */
export function canDeferHoverControls(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(hover: hover)').matches);
}
