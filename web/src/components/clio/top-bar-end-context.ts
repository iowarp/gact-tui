import { createContext } from 'react';

/** The top bar's last slot, after the rail and panel icons, where the conversation ⋯ sits. */
export const TopBarEndHost = createContext<HTMLElement | null>(null);
