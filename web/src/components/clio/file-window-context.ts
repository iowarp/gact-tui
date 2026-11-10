import { createContext } from 'react';

/**
 * True inside a file shown as a window of its bytes, whose row already states what is
 * shown ("Showing the first 512 KB of 2.1 MB"), so a renderer doesn't add a second notice.
 */
export const FileWindowNoticeShown = createContext(false);
