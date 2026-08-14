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
export { Icon, type IconName, type IconProps } from './Icon';
export { StatusDot, type SessionStatus, type StatusDotProps } from './StatusDot';
export { Layer, type LayerProps, type LayerSize } from './Layer';
export { InlineEdit, type InlineEditProps, type InlineEditSize } from './InlineEdit';
export { Tabs, type TabDef, type TabsProps } from './Tabs';
export { Popover, type PopoverPlacement, type PopoverProps } from './Popover';
export { ContextMenu, type ContextMenuProps, type MenuItemDef } from './ContextMenu';
export { Chip, type ChipProps, type ChipTone } from './Chip';
export { ToolbarButton, type ToolbarButtonProps } from './ToolbarButton';
export { Splitter, type SplitterProps } from './Splitter';
export { Select, type SelectOption, type SelectProps } from './Select';
export { MasterDetail, type MasterDetailItem, type MasterDetailProps } from './MasterDetail';
export { Skeleton, type SkeletonProps } from './Skeleton';
export { useIsDesktop } from './useIsDesktop';
