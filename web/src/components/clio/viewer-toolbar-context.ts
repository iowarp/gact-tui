import { createContext } from 'react';

/** The artifact toolbar destination for controls contributed by its active viewer. */
export const ViewerToolbarHost = createContext<HTMLElement | null>(null);
