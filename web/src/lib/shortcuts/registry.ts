import { isMacOS } from '@/lib/platform';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { SHORTCUT_CATALOG, type ShortcutDefinition } from './catalog';
import {
  chordAria,
  chordKeyLabel,
  chordLabels,
  chordMatches,
  chordPosition,
  chordText,
  heldChordText,
  isEditableTarget,
  isTextFieldChord,
  parseChord,
  type KeyPlatform,
  type ParsedChord,
} from './keys';

/** The platform this page runs on, for showing and matching keys. */
export function detectKeyPlatform(): KeyPlatform {
  return isMacOS() ? 'mac' : 'windows';
}

export function detectHost(): 'desktop' | 'browser' {
  try {
    return inTauri() ? 'desktop' : 'browser';
  } catch {
    return 'browser';
  }
}

// ---- Definitions -----------------------------------------------------------

const definitions = new Map<string, ShortcutDefinition>(
  SHORTCUT_CATALOG.map((definition) => [definition.id, definition]),
);
let definitionsVersion = 0;
const definitionListeners = new Set<() => void>();

/** Adds or replaces definitions; the sheet and every key label follow. */
export function defineShortcuts(added: readonly ShortcutDefinition[]): () => void {
  const previous = added.map((definition) => definitions.get(definition.id));
  for (const definition of added) definitions.set(definition.id, definition);
  notifyDefinitions();
  return () => {
    added.forEach((definition, index) => {
      const before = previous[index];
      if (before) definitions.set(definition.id, before);
      else definitions.delete(definition.id);
    });
    notifyDefinitions();
  };
}

function notifyDefinitions() {
  definitionsVersion += 1;
  for (const listener of definitionListeners) listener();
}

export function subscribeShortcutDefinitions(listener: () => void): () => void {
  definitionListeners.add(listener);
  return () => definitionListeners.delete(listener);
}

export function shortcutDefinitionsVersion(): number {
  return definitionsVersion;
}

export function getShortcut(id: string): ShortcutDefinition | undefined {
  return definitions.get(id);
}

/** Definitions that apply on this host, in catalog order. */
export function listShortcuts(host = detectHost()): ShortcutDefinition[] {
  return [...definitions.values()].filter(
    (definition) => !definition.host || definition.host === host,
  );
}

// ---- Presentation ----------------------------------------------------------

const chordCache = {
  windows: new WeakMap<ShortcutDefinition, ParsedChord[]>(),
  mac: new WeakMap<ShortcutDefinition, ParsedChord[]>(),
};

export function shortcutChords(
  definition: ShortcutDefinition,
  platform: KeyPlatform,
): ParsedChord[] {
  const cached = chordCache[platform].get(definition);
  if (cached) return cached;
  const chords =
    platform === 'mac' && definition.mac
      ? definition.mac.map((chord) => parseChord(chord, 'mac', true))
      : definition.keys.map((chord) => parseChord(chord, platform));
  chordCache[platform].set(definition, chords);
  return chords;
}

/** Key caps per chord: `[['Ctrl', 'Shift', 'L']]` or `[['⇧', '⌘', 'L']]`. */
export function shortcutLabels(definition: ShortcutDefinition, platform: KeyPlatform): string[][] {
  return shortcutChords(definition, platform).map((chord) => chordLabels(chord, platform));
}

/** The shortcut as one line of text, for tooltips and menu columns. */
export function shortcutText(definition: ShortcutDefinition, platform: KeyPlatform): string {
  const joiner = definition.joiner === 'pair' ? ' ' : ' or ';
  return shortcutChords(definition, platform)
    .map((chord) => chordText(chord, platform))
    .join(joiner);
}

/**
 * The held-key badge text: the first chord, without the held Ctrl on Windows.
 * A `pair` sharing its modifiers joins as one badge (`Alt ←→`).
 */
export function heldShortcutText(
  definition: ShortcutDefinition,
  platform: KeyPlatform,
  pair?: ShortcutDefinition,
): string | undefined {
  const [first] = shortcutChords(definition, platform);
  if (!first) return undefined;
  const text = heldChordText(first, platform);
  const [second] = pair ? shortcutChords(pair, platform) : [];
  if (!second) return text;
  const same =
    first.modifiers.size === second.modifiers.size &&
    [...first.modifiers].every((modifier) => second.modifiers.has(modifier));
  return same
    ? `${text}${chordKeyLabel(second, platform)}`
    : `${text} ${heldChordText(second, platform)}`;
}

/** The `aria-keyshortcuts` value for this platform. */
export function shortcutAria(
  definition: ShortcutDefinition,
  platform: KeyPlatform,
): string | undefined {
  const values = shortcutChords(definition, platform)
    .map(chordAria)
    .filter((value): value is string => Boolean(value));
  return values.length ? values.join(' ') : undefined;
}

/** Whether `event` presses shortcut `id` on this platform, for a widget's own key handler. */
export function shortcutMatches(
  id: string,
  event: KeyboardEvent,
  platform: KeyPlatform = detectKeyPlatform(),
): boolean {
  const definition = definitions.get(id);
  return Boolean(
    definition && shortcutChords(definition, platform).some((chord) => chordMatches(chord, event)),
  );
}

// ---- Dispatch --------------------------------------------------------------

export interface ShortcutHandlerOptions {
  /**
   * The region focus must be inside. Without it, a tab-scoped key never
   * fires and any other key fires anywhere.
   */
  region?: () => Element | null;
  /** Fire inside a text field even for a key the field would type. */
  allowInTextField?: boolean;
  /**
   * Fire even when a focused widget already handled the key, for app-wide
   * keys a widget also binds (cmdk takes Ctrl+K as "previous item").
   */
  overrideHandled?: boolean;
}

export type ShortcutHandler = (event: KeyboardEvent, position: number | undefined) => void;

interface Registration {
  id: string;
  handler: () => ShortcutHandler;
  options: () => ShortcutHandlerOptions;
}

const registrations: Registration[] = [];
let listening = false;

function inRegion(region: Element | null, event: KeyboardEvent): boolean {
  if (!region) return false;
  const target = event.target instanceof Node ? event.target : null;
  const active = typeof document === 'undefined' ? null : document.activeElement;
  return Boolean((target && region.contains(target)) || (active && region.contains(active)));
}

function dispatch(event: KeyboardEvent) {
  if (event.repeat || event.isComposing) return;
  const platform = detectKeyPlatform();
  const host = detectHost();
  const editable = isEditableTarget(event.target);
  // The most recently mounted handler wins, so a dialog overrides the page.
  for (let index = registrations.length - 1; index >= 0; index -= 1) {
    const registration = registrations[index]!;
    const definition = definitions.get(registration.id);
    if (!definition || (definition.host && definition.host !== host)) continue;
    const options = registration.options();
    if (event.defaultPrevented && !options.overrideHandled) continue;
    for (const chord of shortcutChords(definition, platform)) {
      if (!chordMatches(chord, event)) continue;
      if (editable && !options.allowInTextField && isTextFieldChord(chord, platform)) continue;
      // Tab keys need a region; any other key with a mounted region fires only inside it.
      const region = options.region?.() ?? null;
      if ((definition.group === 'tab' || region) && !inRegion(region, event)) continue;
      event.preventDefault();
      registration.handler()(event, chordPosition(chord, event));
      return;
    }
  }
}

/**
 * Attaches behavior to a catalog shortcut. Handler and options are read
 * through getters at key time, so callers can pass refs and never re-register.
 */
export function registerShortcutHandler(
  id: string,
  handler: () => ShortcutHandler,
  options: () => ShortcutHandlerOptions = () => ({}),
): () => void {
  const registration: Registration = { id, handler, options };
  registrations.push(registration);
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener('keydown', dispatch);
    listening = true;
  }
  return () => {
    const index = registrations.indexOf(registration);
    if (index >= 0) registrations.splice(index, 1);
    if (!registrations.length && listening) {
      window.removeEventListener('keydown', dispatch);
      listening = false;
    }
  };
}

/** Ids that currently have a handler; the sheet lists only keys that work. */
export function activeShortcutIds(): ReadonlySet<string> {
  return new Set(registrations.map((registration) => registration.id));
}
