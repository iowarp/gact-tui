import type { DialogFrameConfirm } from './primitives/dialog-frame';
import { createContext } from 'react';

/**
 * Where the dialog that hosts a service's management puts its lifecycle icons
 * (Stop, Reinstall, Uninstall): the footer, left of Done. Without one, the card
 * draws them as its last row.
 */
export const ServiceFooterSlot = createContext<HTMLElement | null>(null);

/**
 * Lets the setup form put its Install button in the hosting dialog's footer,
 * right of Cancel. Without one, the form draws Install as its last row.
 */
export const ServiceConfirmSlot = createContext<
  ((confirm: DialogFrameConfirm | undefined) => void) | null
>(null);
