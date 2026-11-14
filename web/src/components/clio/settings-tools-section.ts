import type { ToolSetting } from '@clio/core/v3';
import type { StatusTone } from './primitives/status-indicator';

export interface ToolTableSection {
  id: string;
  title: string;
  /** Faint words after the title, each its own part ("github server", "4 tools"). */
  meta?: string[];
  /** A count beside the title. */
  count?: number;
  /** Hover text for the title. */
  hint?: string;
  /** Names the group's bulk choices ("All read-only tools"). */
  bulkLabel: string;
  /** The same group in the middle of a sentence ("all hdf5 tools"). */
  bulkPhrase: string;
  tools: ToolSetting[];
  /** Instead of tools: why there are none yet ("Not loaded yet"). */
  notice?: {
    text: string;
    status: string;
    tone: StatusTone;
    title?: string;
    /** A failed read offers Retry on its row, as every Settings error does. */
    retry?: () => void;
  };
  /** While its tools load: how many rows to hold space for, so the page doesn't jump. */
  reserveRows?: number;
}
