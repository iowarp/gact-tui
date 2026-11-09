import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import type { ShortcutDefinition } from './catalog';
import type { KeyPlatform } from './keys';
import {
  detectKeyPlatform,
  getShortcut,
  listShortcuts,
  registerShortcutHandler,
  shortcutAria,
  shortcutDefinitionsVersion,
  shortcutLabels,
  shortcutText,
  subscribeShortcutDefinitions,
  type ShortcutHandler,
} from './registry';

/**
 * Overrides the detected platform below it, so a review page can show the
 * Windows and the Mac form side by side. The app never sets it.
 */
export const KeyPlatformContext = createContext<KeyPlatform | null>(null);

export function useKeyPlatform(): KeyPlatform {
  const forced = useContext(KeyPlatformContext);
  return forced ?? detectKeyPlatform();
}

export function useShortcutDefinition(id: string | undefined): ShortcutDefinition | undefined {
  const read = () => (id ? getShortcut(id) : undefined);
  return useSyncExternalStore(subscribeShortcutDefinitions, read, read);
}

let listCache: { version: number; list: ShortcutDefinition[] } | undefined;

function shortcutListSnapshot(): ShortcutDefinition[] {
  const version = shortcutDefinitionsVersion();
  if (listCache?.version !== version) listCache = { version, list: listShortcuts() };
  return listCache.list;
}

export function useShortcutList(): ShortcutDefinition[] {
  return useSyncExternalStore(
    subscribeShortcutDefinitions,
    shortcutListSnapshot,
    shortcutListSnapshot,
  );
}

export interface ShortcutPresentation {
  definition: ShortcutDefinition;
  /** One line: `Ctrl Shift L` or `⇧⌘L`. */
  text: string;
  /** Key caps per chord. */
  labels: string[][];
  /** For `aria-keyshortcuts`. */
  aria: string | undefined;
}

const RANGE = /\d–\d/u;

/** One position of a range shortcut (`Ctrl+Shift+1–7` at 3 is `Ctrl+Shift+3`). */
export function shortcutAtPosition(
  definition: ShortcutDefinition,
  position: number,
): ShortcutDefinition {
  const at = (chord: string) => chord.replace(RANGE, String(position));
  return {
    ...definition,
    keys: definition.keys.map(at),
    mac: definition.mac?.map(at),
  };
}

/**
 * How a shortcut reads on this platform; nothing when the id is unknown.
 * `position` picks one key of a range (the strip's third icon reads
 * `Ctrl Shift 3`, not `Ctrl Shift 1–7`).
 */
export function useShortcutPresentation(
  id: string | undefined,
  position?: number,
): ShortcutPresentation | undefined {
  const catalogued = useShortcutDefinition(id);
  const platform = useKeyPlatform();
  return useMemo(() => {
    if (!catalogued) return undefined;
    const definition =
      position === undefined ? catalogued : shortcutAtPosition(catalogued, position);
    return {
      definition,
      text: shortcutText(definition, platform),
      labels: shortcutLabels(definition, platform),
      aria: shortcutAria(definition, platform),
    };
  }, [catalogued, platform, position]);
}

export interface UseShortcutOptions {
  enabled?: boolean;
  /** Required for "the tab you're in" keys: focus must be inside it. */
  region?: RefObject<Element | null>;
  allowInTextField?: boolean;
  overrideHandled?: boolean;
}

/**
 * Runs `handler` when the shortcut `id` is pressed. Registers once per id;
 * a new handler or options on each render does not re-register.
 */
export function useShortcut(
  id: string,
  handler: ShortcutHandler,
  options: UseShortcutOptions = {},
) {
  const handlerRef = useRef(handler);
  const optionsRef = useRef(options);
  useEffect(() => {
    handlerRef.current = handler;
    optionsRef.current = options;
  });
  const enabled = options.enabled ?? true;
  useEffect(() => {
    if (!enabled) return undefined;
    return registerShortcutHandler(
      id,
      () => handlerRef.current,
      () => ({
        region: () => optionsRef.current.region?.current ?? null,
        allowInTextField: optionsRef.current.allowInTextField,
        overrideHandled: optionsRef.current.overrideHandled,
      }),
    );
  }, [id, enabled]);
}

// ---- Held command key ------------------------------------------------------

const HOLD_DELAY_MS = 500;
let held = false;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
const heldListeners = new Set<() => void>();

function setHeld(next: boolean) {
  if (held === next) return;
  held = next;
  for (const listener of heldListeners) listener();
}

function onHeldKey(event: KeyboardEvent) {
  const command = detectKeyPlatform() === 'mac' ? 'Meta' : 'Control';
  const onlyCommand =
    event.type === 'keydown' &&
    event.key === command &&
    !event.shiftKey &&
    !event.altKey &&
    (command === 'Meta' ? !event.ctrlKey : !event.metaKey);
  clearTimeout(holdTimer);
  if (onlyCommand) {
    if (!event.repeat) holdTimer = setTimeout(() => setHeld(true), HOLD_DELAY_MS);
    return;
  }
  setHeld(false);
}

function releaseHeld() {
  clearTimeout(holdTimer);
  setHeld(false);
}

function subscribeHeld(listener: () => void) {
  if (!heldListeners.size) {
    window.addEventListener('keydown', onHeldKey, true);
    window.addEventListener('keyup', onHeldKey, true);
    window.addEventListener('blur', releaseHeld);
  }
  heldListeners.add(listener);
  return () => {
    heldListeners.delete(listener);
    if (!heldListeners.size) {
      window.removeEventListener('keydown', onHeldKey, true);
      window.removeEventListener('keyup', onHeldKey, true);
      window.removeEventListener('blur', releaseHeld);
      releaseHeld();
    }
  };
}

/** True while Ctrl (⌘ on a Mac) is held alone for half a second. */
export function useCommandKeyHeld(): boolean {
  return useSyncExternalStore(
    subscribeHeld,
    () => held,
    () => false,
  );
}
