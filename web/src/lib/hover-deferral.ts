/** Hover-only controls may wait for the pointer: the device can hover. */
export const HOVER_DEFERRAL = '(hover: hover)';

/**
 * Message actions hide behind hover only from `sm` up; narrower, they always show,
 * so deferring them there would hide them and shift the meta beside them.
 */
export const WIDE_HOVER_DEFERRAL = '(hover: hover) and (min-width: 40rem)';

/**
 * Whether hover-only controls can wait for the pointer or focus to reach their
 * row before mounting. Devices without hover show those controls at once.
 */
export function canDeferHoverControls(query: string = HOVER_DEFERRAL): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches);
}
