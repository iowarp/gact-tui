import { createContext } from 'react';

/** Undefined means standalone; null means a shared viewer whose information is closed. */
export const FileViewerInformationHost = createContext<HTMLElement | null | undefined>(undefined);

/** Source layout belongs to the file, surviving changes between readable and source modes. */
export const FileSourceOptions = createContext<
  { wrap: boolean; setWrap: (wrap: boolean) => void } | undefined
>(undefined);
