/**
 * The component kit — the app's single source of UI primitives.
 *
 * The owner's rule: "never again one class per window". Every surface composes
 * from here; nothing hand-rolls a dialog, tab strip, menu, scrim or part
 * frame. `tests/unit/kit-conformance.test.ts` enforces that, and it fails on a
 * planted violation so it can never pass vacuously.
 *
 * Geometry is transcribed from the Session v3 prototype (the authoritative
 * render target), not invented.
 */
export { Modal, type ModalProps, type ModalTone } from './Modal';
export { PartCard, type PartCardProps } from './PartCard';
export { KvGrid, type KvGridProps, type KvRow } from './KvGrid';
export { Eyebrow, type EyebrowProps } from './Eyebrow';
export { useIsDesktop } from './useIsDesktop';
