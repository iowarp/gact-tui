import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  selectionKey,
  type SelectionState,
  type SelectionWriter,
} from '@/components/clio/selection-state';

interface Store {
  values: ReadonlyMap<string, SelectionState>;
  write: (dataUri: string, value: SelectionState) => void;
}

const Context = createContext<Store | undefined>(undefined);

/** Link views of one artifact without requiring a producer-authored data-model path. */
export function AutoDatasetSelectionProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<ReadonlyMap<string, SelectionState>>(new Map());
  const write = useCallback((dataUri: string, value: SelectionState) => {
    setValues((current) => {
      const previous = current.get(dataUri);
      if (
        previous &&
        selectionKey(previous.field, previous.values) === selectionKey(value.field, value.values) &&
        previous.source === value.source
      ) {
        return current;
      }
      return new Map(current).set(dataUri, value);
    });
  }, []);
  const store = useMemo(() => ({ values, write }), [values, write]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

/** Shared selection for an artifact in the current surface, if it has a provider. */
// oxlint-disable-next-line react/only-export-components
export function useAutoDatasetSelection(dataUri: string | undefined): {
  selection: SelectionState | undefined;
  setSelection: SelectionWriter | undefined;
  active: boolean;
} {
  const store = useContext(Context);
  const active = Boolean(store && dataUri);
  const write = store?.write;
  const setSelection = useMemo<SelectionWriter | undefined>(
    () => (write && dataUri ? (value) => write(dataUri, value) : undefined),
    [dataUri, write],
  );
  return { active, selection: dataUri ? store?.values.get(dataUri) : undefined, setSelection };
}
