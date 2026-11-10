import { createContext } from 'react';
import type { FileMode } from './file-mode-controls';

/** A renderer's own representations, lifted into the frame's one segment. */
export interface RendererModes {
  modes: readonly FileMode[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * The frame's mode segment. A renderer's mode control renders its tabs into
 * `host` and registers them, so the frame shows one toggle (Render, Source,
 * Lineage) and folds them into one menu when narrow.
 */
export interface FileViewerModeSlot {
  host: HTMLElement | null;
  register: (id: string, modes?: RendererModes) => void;
  /** The frame shows one of its own views (Lineage), not the renderer's. */
  frameActive: boolean;
  /** Back to the renderer, when one of its modes is chosen again. */
  showRenderer: () => void;
}

export const FileViewerModeSlotContext = createContext<FileViewerModeSlot | undefined>(undefined);

/** The renderer mode that shows the bytes as text. */
export const isSourceMode = (mode: Pick<FileMode, 'value'>) =>
  mode.value === 'source' || mode.value === 'raw';
