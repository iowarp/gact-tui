import { createContext } from 'react';

/** Parent artifact identity retained by references to its individual data views. */
export const ArtifactReferenceContext = createContext<
  | {
      uri: string;
      definition_path: string;
      title: string;
    }
  | undefined
>(undefined);
