import { createContext } from 'react';

/** Undefined means standalone; null means a shared viewer whose information is closed. */
export const FileViewerInformationHost = createContext<HTMLElement | null | undefined>(undefined);
