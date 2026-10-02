import { createContext, useContext } from 'react';

/**
 * Whether a data view's header is too narrow for labeled toolbar buttons.
 *
 * A chart or map measures its own width (charts and maps often share a row, so
 * each gets half the conversation column) and provides this around its header.
 * The toolbar buttons then show only their icon, keeping the view's title on
 * the header line instead of wrapping under the buttons. The accessible name
 * never changes. Outside a provider (the table's full-width toolbar) buttons
 * keep their labels.
 */
export const DataHeaderCompactContext = createContext(false);

/** Width below which a data view's header drops its button labels. Unit: CSS pixels. */
export const DATA_HEADER_LABEL_MIN_WIDTH = 448;

/** Reads whether the enclosing data view header is compact. */
export function useDataHeaderCompact(): boolean {
  return useContext(DataHeaderCompactContext);
}
