import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHORTCUT_CATALOG } from './catalog';
import {
  chordMatches,
  chordPosition,
  chordText,
  isTextFieldChord,
  parseChord,
  type KeyPlatform,
  type ParsedChord,
} from './keys';
import {
  defineShortcuts,
  getShortcut,
  registerShortcutHandler,
  shortcutChords,
  shortcutText,
} from './registry';

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
    // The Help menu's search over the menu bar.
    'Shift+Cmd+/',
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

function keysOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const range = (key: string) => /^(\d)\u2013(\d)$/u.exec(key)?.slice(1, 3) ?? [key, key];
  const [[aLo, aHi], [bLo, bHi]] = [range(a), range(b)];
  if (![aLo, bLo].every((key) => /^\d$/u.test(key!))) return false;
  return !(aHi! < bLo! || bHi! < aLo!);
}

/** Whether `parsed` (already for `platform`) collides with a browser or OS key. */
function isReservedChord(parsed: ParsedChord, platform: KeyPlatform): boolean {
  if (parsed.hold) return false;
  return RESERVED[platform].some((reserved) => {
    const other = parseChord(reserved, platform, true);
    const sameModifiers =
      other.modifiers.size === parsed.modifiers.size &&
      [...other.modifiers].every((modifier) => parsed.modifiers.has(modifier));
    return sameModifiers && keysOverlap(other.key, parsed.key);
  });
}
function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe('chords', () => {
  it('derives the Mac form from the Windows form', () => {
    expect(chordText(parseChord('Ctrl+Shift+L', 'windows'), 'windows')).toBe('Ctrl Shift L');
    expect(chordText(parseChord('Ctrl+Shift+L', 'mac'), 'mac')).toBe('⇧⌘L');
    expect(chordText(parseChord('Ctrl+Enter', 'mac'), 'mac')).toBe('⌘↩');
    expect(chordText(parseChord('Ctrl+Enter', 'windows'), 'windows')).toBe('Ctrl ↵');
    expect(chordText(parseChord('Shift+Esc', 'mac'), 'mac')).toBe('⇧ Esc');
    expect(chordText(parseChord('hold Ctrl', 'mac'), 'mac')).toBe('hold ⌘');
  });

  it('keeps hand-written Mac exceptions', () => {
    const fullscreen = getShortcut('fullscreen')!;
    expect(shortcutText(fullscreen, 'mac')).toBe('⌃⌘F');
    expect(shortcutText(getShortcut('previous-conversation')!, 'mac')).toBe('⌥⌘↑');
    expect(shortcutText(getShortcut('previous-conversation')!, 'windows')).toBe('Alt ↑');
  });

  it('leaves macOS keys to macOS and reads the Mac ⌫ key (#739)', () => {
    // ⇧⌘/ searches the Mac menu bar, which is the app menu there.
    expect(shortcutChords(getShortcut('app-menu')!, 'mac')).toEqual([]);
    expect(shortcutText(getShortcut('app-menu')!, 'windows')).toBe('Alt Space');
    expect(shortcutText(getShortcut('close-tab')!, 'mac')).toBe('⌘⌫');
    const backspace = { key: 'Backspace', code: 'Backspace', ctrlKey: false, altKey: false };
    const closeTab = getShortcut('close-tab')!;
    expect(
      shortcutChords(closeTab, 'mac').some((chord) =>
        chordMatches(chord, { ...backspace, shiftKey: false, metaKey: true }),
      ),
    ).toBe(true);
    expect(shortcutText(getShortcut('reload')!, 'mac')).toBe('⌘R');
    expect(shortcutText(getShortcut('downloads')!, 'mac')).toBe('⌘J');
  });

  it('changes the composer mode with a chord typing leaves alone', () => {
    const mode = getShortcut('mode')!;
    expect(mode.name).toBe('Change mode');
    expect(shortcutText(mode, 'windows')).toBe('Ctrl Shift M');
    expect(shortcutText(mode, 'mac')).toBe('⇧⌘M');
    for (const platform of ['windows', 'mac'] as const) {
      for (const chord of shortcutChords(mode, platform)) {
        expect(isTextFieldChord(chord, platform)).toBe(false);
      }
    }
  });

  it('matches exactly and reports the position of a range', () => {
    const range = parseChord('Ctrl+Shift+1–7', 'windows');
    const event = {
      key: '#',
      code: 'Digit3',
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
    };
    expect(chordMatches(range, event)).toBe(true);
    expect(chordPosition(range, event)).toBe(3);
    expect(chordMatches(range, { ...event, code: 'Digit8', key: '*' })).toBe(false);
    expect(chordMatches(range, { ...event, altKey: true })).toBe(false);
  });

  it('never binds a browser or OS key outside the desktop app', () => {
    for (const definition of SHORTCUT_CATALOG) {
      if (
        definition.host === 'desktop' ||
        definition.group === 'menu' ||
        definition.group === 'graph'
      )
        continue;
      for (const platform of ['windows', 'mac'] as const) {
        for (const chord of shortcutChords(definition, platform)) {
          expect(isReservedChord(chord, platform), `${definition.id} on ${platform}`).toBe(false);
        }
      }
    }
    expect(isReservedChord(parseChord('Ctrl+N', 'windows'), 'windows')).toBe(true);
    expect(isReservedChord(parseChord('Ctrl+4', 'mac'), 'mac')).toBe(true);
  });

  it('leaves typing and editing keys to text fields', () => {
    expect(isTextFieldChord(parseChord('Shift+A', 'windows'), 'windows')).toBe(true);
    expect(isTextFieldChord(parseChord('Ctrl+Z', 'windows'), 'windows')).toBe(true);
    expect(isTextFieldChord(parseChord('Alt+E', 'mac', true), 'mac')).toBe(true);
    expect(isTextFieldChord(parseChord('Ctrl+K', 'windows'), 'windows')).toBe(false);
    expect(isTextFieldChord(parseChord('Esc', 'windows'), 'windows')).toBe(false);
  });
});

describe('registry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches to the most recent handler and prevents the default', () => {
    const first = vi.fn();
    const second = vi.fn();
    const undoFirst = registerShortcutHandler('search', () => first);
    const undoSecond = registerShortcutHandler('search', () => second);
    const event = press({ key: 'k', code: 'KeyK', ctrlKey: true });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    undoSecond();
    press({ key: 'k', code: 'KeyK', ctrlKey: true });
    expect(first).toHaveBeenCalledTimes(1);
    undoFirst();
  });

  it('skips text-field keys inside an input unless allowed', () => {
    const undoDefine = defineShortcuts([
      { id: 'test-undo', name: 'Undo', group: 'anywhere', keys: ['Ctrl+Z'] },
    ]);
    const handler = vi.fn();
    let allow = false;
    const undo = registerShortcutHandler(
      'test-undo',
      () => handler,
      () => ({ allowInTextField: allow }),
    );
    const input = document.createElement('input');
    document.body.append(input);
    const init = { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', init));
    expect(handler).not.toHaveBeenCalled();
    allow = true;
    input.dispatchEvent(new KeyboardEvent('keydown', init));
    expect(handler).toHaveBeenCalledTimes(1);
    undo();
    undoDefine();
    input.remove();
  });

  it('leaves a key a focused widget handled unless the handler overrides it', () => {
    const handler = vi.fn();
    let override = false;
    const undo = registerShortcutHandler(
      'search',
      () => handler,
      () => ({ overrideHandled: override }),
    );
    const widget = document.createElement('div');
    widget.addEventListener('keydown', (event) => event.preventDefault());
    document.body.append(widget);
    const init = { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true };
    widget.dispatchEvent(new KeyboardEvent('keydown', init));
    expect(handler).not.toHaveBeenCalled();
    override = true;
    widget.dispatchEvent(new KeyboardEvent('keydown', init));
    expect(handler).toHaveBeenCalledTimes(1);
    undo();
    widget.remove();
  });

  it('requires focus inside the region for tab keys', () => {
    const handler = vi.fn();
    const region = document.createElement('div');
    const button = document.createElement('button');
    region.append(button);
    document.body.append(region);
    const undo = registerShortcutHandler(
      'render-source',
      () => handler,
      () => ({ region: () => region }),
    );
    const chord = shortcutChords(getShortcut('render-source')!, 'windows')[0]!;
    const init = {
      key: chord.key.toLowerCase(),
      code: /^[A-Z]$/u.test(chord.key) ? `Key${chord.key}` : chord.key,
      ctrlKey: chord.modifiers.has('ctrl'),
      altKey: chord.modifiers.has('alt'),
      shiftKey: chord.modifiers.has('shift'),
      bubbles: true,
      cancelable: true,
    };
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    expect(handler).not.toHaveBeenCalled();
    button.dispatchEvent(new KeyboardEvent('keydown', init));
    expect(handler).toHaveBeenCalledTimes(1);
    undo();
    region.remove();
  });

  it('lets surfaces add definitions and undo them', () => {
    const undo = defineShortcuts([
      { id: 'test-only', name: 'Test', group: 'anywhere', keys: ['Ctrl+Shift+Y'] },
    ]);
    expect(getShortcut('test-only')?.name).toBe('Test');
    undo();
    expect(getShortcut('test-only')).toBeUndefined();
  });
});
