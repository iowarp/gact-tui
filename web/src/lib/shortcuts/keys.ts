/**
 * Keyboard chords, written once in Windows form and shown on both platforms.
 *
 * A chord is `+`-joined key names, for example `Ctrl+Shift+L`, `Alt+Up`,
 * `Shift+F10`, `Esc` or `Ctrl+Shift+1–7` (a position range). `hold Ctrl` is the
 * held-modifier gesture. The Mac form is derived (Ctrl becomes ⌘, Alt ⌥,
 * Enter ↩, Delete ⌫, in Apple's order ⌃⌥⇧⌘); a definition writes a Mac chord
 * by hand only for the documented exceptions, and in a hand-written Mac chord
 * `Ctrl` means ⌃ and `Cmd` means ⌘.
 *
 * See docs/design/visual-language/workbench-keyboard.html.
 */

export type KeyPlatform = 'windows' | 'mac';

export type Modifier = 'ctrl' | 'alt' | 'shift' | 'meta';

export interface ParsedChord {
  /** Physical modifiers on the platform the chord is for. */
  modifiers: ReadonlySet<Modifier>;
  /** Canonical key name: `L`, `1`, `1–7`, `Enter`, `Up`, `F10`, `` ` ``. */
  key: string;
  /** `hold Ctrl`: shown, never dispatched. */
  hold: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  '↵': 'Enter',
  '↩': 'Enter',
  Return: 'Enter',
  Escape: 'Esc',
  '↑': 'Up',
  '↓': 'Down',
  '←': 'Left',
  '→': 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Del: 'Delete',
  '⌫': 'Backspace',
  ' ': 'Space',
  PgUp: 'PageUp',
  PgDn: 'PageDown',
  Plus: '+',
};

const MODIFIER_NAMES: Record<string, Modifier | 'cmd'> = {
  Ctrl: 'ctrl',
  Control: 'ctrl',
  Alt: 'alt',
  Option: 'alt',
  Shift: 'shift',
  Cmd: 'cmd',
  Meta: 'cmd',
};

function canonicalKey(name: string): string {
  const aliased = KEY_ALIASES[name] ?? name;
  return aliased.length === 1 ? aliased.toUpperCase() : aliased;
}

function splitChord(chord: string): string[] {
  if (chord.endsWith('++')) return [...chord.slice(0, -2).split('+').filter(Boolean), '+'];
  return chord.split('+').filter(Boolean);
}

/**
 * Parses a chord for `platform`. A Windows-form chord asked for on a Mac is
 * derived (Ctrl → ⌘); pass `handWritten` for a chord already in Mac terms.
 */
export function parseChord(chord: string, platform: KeyPlatform, handWritten = false): ParsedChord {
  const trimmed = chord.trim();
  const hold = /^hold\s+/u.test(trimmed);
  const parts = splitChord(trimmed.replace(/^hold\s+/u, ''));
  const modifiers = new Set<Modifier>();
  let key = '';
  for (const part of parts) {
    const modifier = MODIFIER_NAMES[part];
    if (!modifier) {
      key = canonicalKey(part);
      continue;
    }
    if (modifier === 'cmd') modifiers.add(platform === 'mac' ? 'meta' : 'ctrl');
    else if (modifier === 'ctrl' && platform === 'mac' && !handWritten) modifiers.add('meta');
    else modifiers.add(modifier);
  }
  if (hold && !key) {
    // `hold Ctrl` names a modifier, not a key.
    const [only] = modifiers;
    return { modifiers: new Set(), key: only ?? 'ctrl', hold: true };
  }
  return { modifiers, key, hold };
}

const MODIFIER_LABELS: Record<KeyPlatform, Record<Modifier, string>> = {
  windows: { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' },
  mac: { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' },
};
const MODIFIER_ORDER: readonly Modifier[] = ['ctrl', 'alt', 'shift', 'meta'];

/**
 * Modifier names for pointer gestures in help text (`⌘-click`, `Ctrl-click`).
 * On a Mac, Ctrl-click is a right-click, so the primary modifier is ⌘.
 */
export function gestureModifiers(platform: KeyPlatform) {
  return platform === 'mac'
    ? { primary: '⌘', primaryShift: '⇧⌘', alt: '⌥' }
    : { primary: 'Ctrl', primaryShift: 'Ctrl+Shift', alt: 'Alt' };
}

const KEY_LABELS: Record<KeyPlatform, Record<string, string>> = {
  windows: { Enter: '↵', Up: '↑', Down: '↓', Left: '←', Right: '→' },
  mac: { Enter: '↩', Up: '↑', Down: '↓', Left: '←', Right: '→', Delete: '⌫', Backspace: '⌫' },
};

/** The labels of one chord, one per key cap, in the platform's order. */
export function chordLabels(parsed: ParsedChord, platform: KeyPlatform): string[] {
  const modifierLabels = MODIFIER_LABELS[platform];
  if (parsed.hold) return [`hold ${modifierLabels[parsed.key as Modifier] ?? parsed.key}`];
  const labels = MODIFIER_ORDER.filter((modifier) => parsed.modifiers.has(modifier)).map(
    (modifier) => modifierLabels[modifier],
  );
  if (parsed.key) labels.push(KEY_LABELS[platform][parsed.key] ?? parsed.key);
  return labels;
}

/** One chord as text: `Ctrl Shift L` on Windows, `⇧⌘L` on a Mac. */
export function chordText(parsed: ParsedChord, platform: KeyPlatform): string {
  const labels = chordLabels(parsed, platform);
  if (platform === 'windows' || parsed.hold) return labels.join(' ');
  // Mac glyph modifiers join the key; a word key keeps a gap (`⇧ Esc`).
  const last = labels.at(-1) ?? '';
  const glyphs = labels.slice(0, -1).join('');
  if (!glyphs) return last;
  return last.length > 1 && !/^\d–\d$/u.test(last) ? `${glyphs} ${last}` : `${glyphs}${last}`;
}

const ARIA_KEYS: Record<string, string> = {
  Esc: 'Escape',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
};
const ARIA_MODIFIERS: Record<Modifier, string> = {
  ctrl: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
};

/** The chord in `aria-keyshortcuts` syntax, or nothing for a gesture or range. */
export function chordAria(parsed: ParsedChord): string | undefined {
  if (parsed.hold || !parsed.key || parsed.key.includes('–')) return undefined;
  const modifiers = MODIFIER_ORDER.filter((modifier) => parsed.modifiers.has(modifier)).map(
    (modifier) => ARIA_MODIFIERS[modifier],
  );
  return [...modifiers, ARIA_KEYS[parsed.key] ?? parsed.key].join('+');
}

const CODE_KEYS: Record<string, string> = {
  Backquote: '`',
  Space: 'Space',
  Period: '.',
  Comma: ',',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadEnter: 'Enter',
  Escape: 'Esc',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/**
 * The key an event pressed, by physical position for letters, digits and
 * punctuation so Shift and the keyboard layout do not change it.
 */
export function eventKey(event: Pick<KeyboardEvent, 'key' | 'code'>): string {
  const code = event.code ?? '';
  if (/^Key[A-Z]$/u.test(code)) return code.slice(3);
  if (/^Digit\d$/u.test(code)) return code.slice(5);
  if (/^Numpad\d$/u.test(code)) return code.slice(6);
  const mapped = CODE_KEYS[code];
  if (mapped) return mapped;
  return canonicalKey(event.key ?? '');
}

export type ChordEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
>;

function digitRange(key: string): [string, string] | undefined {
  const match = /^(\d)–(\d)$/u.exec(key);
  return match ? [match[1]!, match[2]!] : undefined;
}

function keysOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const [ra, rb] = [digitRange(a), digitRange(b)];
  if (ra && /^\d$/u.test(b)) return b >= ra[0] && b <= ra[1];
  if (rb && /^\d$/u.test(a)) return a >= rb[0] && a <= rb[1];
  if (ra && rb) return !(ra[1] < rb[0] || rb[1] < ra[0]);
  return false;
}

/** Whether `event` presses exactly `parsed` (no extra modifiers). */
export function chordMatches(parsed: ParsedChord, event: ChordEvent): boolean {
  if (parsed.hold || !parsed.key) return false;
  return (
    event.ctrlKey === parsed.modifiers.has('ctrl') &&
    event.altKey === parsed.modifiers.has('alt') &&
    event.shiftKey === parsed.modifiers.has('shift') &&
    event.metaKey === parsed.modifiers.has('meta') &&
    keysOverlap(parsed.key, eventKey(event))
  );
}

/** The position a range chord matched (`Ctrl+Shift+1–7` pressed as 3 gives 3). */
export function chordPosition(parsed: ParsedChord, event: ChordEvent): number | undefined {
  if (!digitRange(parsed.key)) return undefined;
  const pressed = Number(eventKey(event));
  return Number.isFinite(pressed) ? pressed : undefined;
}

/**
 * Keys the browser or the OS keeps. Nothing binds them; a definition that
 * needs one (the desktop app owns Ctrl N) marks itself desktop-only.
 */
const RESERVED: Record<KeyPlatform, readonly string[]> = {
  windows: [
    'Ctrl+N',
    'Ctrl+T',
    'Ctrl+W',
    'Ctrl+Tab',
    'Ctrl+L',
    'Ctrl+1–9',
    'Ctrl+PageUp',
    'Ctrl+PageDown',
    'F5',
    'Ctrl+Shift+N',
    'Ctrl+Shift+T',
    'Ctrl+Shift+W',
    'Ctrl+Shift+I',
    'Ctrl+Shift+J',
    'Ctrl+Shift+C',
  ],
  mac: [
    'Cmd+Q',
    'Cmd+H',
    'Cmd+M',
    'Cmd+N',
    'Cmd+T',
    'Cmd+W',
    'Cmd+L',
    'Cmd+Tab',
    'Cmd+`',
    'Cmd+Space',
    'Cmd+1–9',
    'Shift+Cmd+3–5',
    'Alt+Cmd+M',
    'Alt+Cmd+I',
    'Alt+Cmd+J',
    'Alt+Cmd+C',
    'Alt+Cmd+U',
    'Ctrl+Space',
    'Ctrl+Left',
    'Ctrl+Right',
    'Ctrl+Up',
    'Ctrl+Down',
  ],
};

function sameModifiers(a: ReadonlySet<Modifier>, b: ReadonlySet<Modifier>): boolean {
  return a.size === b.size && [...a].every((modifier) => b.has(modifier));
}

/** Whether `parsed` (already for `platform`) collides with a browser or OS key. */
export function isReservedChord(parsed: ParsedChord, platform: KeyPlatform): boolean {
  if (parsed.hold) return false;
  return RESERVED[platform].some((reserved) => {
    const other = parseChord(reserved, platform, true);
    return sameModifiers(other.modifiers, parsed.modifiers) && keysOverlap(other.key, parsed.key);
  });
}

const TEXT_EDITING_KEYS = new Set([
  'A',
  'C',
  'V',
  'X',
  'Y',
  'Z',
  'Left',
  'Right',
  'Up',
  'Down',
  'Backspace',
  'Delete',
  'Home',
  'End',
]);

/**
 * Whether a field that accepts typing keeps this chord for its own meaning:
 * plain or Shift keys, clipboard and undo, word movement, and on a Mac any
 * bare ⌥ chord (⌥ types characters there).
 */
export function isTextFieldChord(parsed: ParsedChord, platform: KeyPlatform): boolean {
  const command = platform === 'mac' ? 'meta' : 'ctrl';
  const { modifiers, key } = parsed;
  if (!modifiers.has('ctrl') && !modifiers.has('meta') && !modifiers.has('alt')) {
    return key !== 'Esc' && !/^F\d+$/u.test(key);
  }
  if (
    platform === 'mac' &&
    modifiers.has('alt') &&
    !modifiers.has('meta') &&
    !modifiers.has('ctrl')
  ) {
    return true;
  }
  return modifiers.has(command) && !modifiers.has('alt') && TEXT_EDITING_KEYS.has(key);
}

const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'submit',
  'reset',
  'color',
  'file',
]);

/** Whether `target` is a place where typing produces text. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly;
  if (target instanceof HTMLInputElement)
    return !target.readOnly && !NON_TEXT_INPUTS.has(target.type);
  return target.getAttribute('role') === 'textbox';
}
