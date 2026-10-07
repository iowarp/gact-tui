import { createContext } from 'react';

/** The shared file toolbar destination for controls contributed by its active renderer. */
export const ViewerToolbarHost = createContext<HTMLElement | null>(null);
