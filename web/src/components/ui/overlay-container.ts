import { createContext } from 'react';

/** Keeps menus and dialogs inside a native fullscreen surface; normal pages use the body. */
export const OverlayContainer = createContext<HTMLElement | undefined>(undefined);
