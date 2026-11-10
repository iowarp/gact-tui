import { createContext } from 'react';

/**
 * Where the dialog that hosts a service's management puts its lifecycle icons
 * (Stop, Reinstall, Uninstall): the footer, left of Done. Without one, the card
 * draws them as its last row.
 */
export const ServiceFooterSlot = createContext<HTMLElement | null>(null);
