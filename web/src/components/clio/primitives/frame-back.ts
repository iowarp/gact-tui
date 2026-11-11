import { createContext } from 'react';

/**
 * The list an item tab replaced (a pick in the Artifacts tab shows the artifact
 * in that tab). A frame bar inside the tab draws Back before its crumbs.
 */
export interface FrameBack {
  /** The list's name ("Artifacts"); the button reads "Back to Artifacts". */
  label: string;
  onBack: () => void;
}

export const FrameBackContext = createContext<FrameBack | undefined>(undefined);
