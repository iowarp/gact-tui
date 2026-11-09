/**
 * Every keyboard shortcut, written once. The tooltip, the menu's right
 * column, the held-key badge and the shortcut sheet all read from here, so a
 * key changes in one place. Surfaces attach behavior with `useShortcut(id)`
 * and may add their own definitions with `defineShortcuts`.
 *
 * Keys are Windows form; `mac` is written only for the documented exceptions
 * (docs/design/visual-language/workbench-keyboard.html, "On a Mac").
 */

export type ShortcutGroup = 'anywhere' | 'composer' | 'strip' | 'tab' | 'menu' | 'graph';

export interface ShortcutGroupInfo {
  id: ShortcutGroup;
  label: string;
  /** How the keys in this group reach their target. */
  scope: 'anywhere' | 'tab' | 'local';
}

export const SHORTCUT_GROUPS: readonly ShortcutGroupInfo[] = [
  { id: 'anywhere', label: 'Anywhere', scope: 'anywhere' },
  { id: 'composer', label: 'Composer', scope: 'local' },
  { id: 'strip', label: 'The strip, by position', scope: 'anywhere' },
  { id: 'tab', label: "The tab you're in", scope: 'tab' },
  { id: 'menu', label: 'In any menu', scope: 'local' },
  { id: 'graph', label: 'Lineage graph', scope: 'local' },
];

export interface ShortcutDefinition {
  id: string;
  /** The action's name, as the tooltip and the sheet show it. */
  name: string;
  group: ShortcutGroup;
  /** One or more chords in Windows form; more than one shows as "or". */
  keys: readonly string[];
  /** Hand-written Mac chords, only where macOS owns the derived key. */
  mac?: readonly string[];
  /** Only where this host owns the key (the desktop app owns Ctrl N). */
  host?: 'desktop' | 'browser';
  /** Show the chords side by side instead of with "or" (`↑ ↓`). */
  joiner?: 'or' | 'pair';
}

const def = (
  id: string,
  name: string,
  group: ShortcutGroup,
  keys: readonly string[],
  extra: Partial<Pick<ShortcutDefinition, 'mac' | 'host' | 'joiner'>> = {},
): ShortcutDefinition => ({ id, name, group, keys, ...extra });

export const SHORTCUT_CATALOG: readonly ShortcutDefinition[] = [
  def('search', 'Search and commands', 'anywhere', ['Ctrl+K']),
  def('save-changes', 'Save typed settings', 'anywhere', ['Ctrl+S']),
  def('new-conversation', 'New conversation', 'anywhere', ['Ctrl+N'], { host: 'desktop' }),
  def('new-conversation-browser', 'New conversation', 'anywhere', ['Ctrl+Shift+O'], {
    host: 'browser',
  }),
  def('left-pocket', 'Left pocket', 'anywhere', ['Ctrl+B']),
  def('right-pocket', 'Right pocket', 'anywhere', ['Ctrl+Shift+B']),
  def('previous-conversation', 'Previous conversation', 'anywhere', ['Alt+Up'], {
    mac: ['Alt+Cmd+Up'],
  }),
  def('next-conversation', 'Next conversation', 'anywhere', ['Alt+Down'], {
    mac: ['Alt+Cmd+Down'],
  }),
  def('conversation-runs', 'Runs in this conversation', 'anywhere', ['Ctrl+.'], {
    mac: ['Shift+Cmd+.'],
  }),
  def('conversation-menu', "This conversation's menu", 'anywhere', ['Alt+.'], {
    mac: ['Alt+Cmd+.'],
  }),
  def('composer-focus', 'Back to the composer', 'anywhere', ['Shift+Esc']),
  def('next-region', 'Next region', 'anywhere', ['F6']),
  def('previous-region', 'Previous region', 'anywhere', ['Shift+F6']),
  def('app-menu', 'App menu', 'anywhere', ['Alt+Space'], { mac: ['Shift+Cmd+/'] }),
  def('settings', 'Settings', 'anywhere', ['Ctrl+,']),
  def('infrastructure', 'Infrastructure', 'anywhere', ['Ctrl+Shift+,']),
  // Ctrl Shift A is the browser's tab search, so notifications take Ctrl Alt N.
  def('notifications', 'Notifications', 'anywhere', ['Ctrl+Alt+N']),
  def('shortcuts', 'All shortcuts', 'anywhere', ['Ctrl+/']),
  def('show-keys', 'Show keys on screen', 'anywhere', ['hold Ctrl']),
  def('fullscreen', 'Full screen', 'anywhere', ['F11'], { host: 'desktop', mac: ['Ctrl+Cmd+F'] }),
  def('zoom-in', 'Zoom in', 'anywhere', ['Ctrl+='], { host: 'desktop' }),
  def('zoom-out', 'Zoom out', 'anywhere', ['Ctrl+-'], { host: 'desktop' }),
  def('zoom-reset', 'Actual size', 'anywhere', ['Ctrl+0'], { host: 'desktop' }),

  def('send', 'Send', 'composer', ['Enter']),
  def('steer', 'Steer while it runs', 'composer', ['Ctrl+Enter']),
  def('new-line', 'New line', 'composer', ['Shift+Enter']),
  def('mention', 'Mention a file or agent', 'composer', ['@']),
  def('stop', 'Stop', 'composer', ['Esc'], { mac: ['Esc', 'Cmd+.'] }),

  def('strip-position', 'Strip icon by position', 'strip', ['Ctrl+Shift+1–7'], {
    mac: ['Alt+Cmd+1–7'],
  }),
  def('terminal', 'Terminal', 'strip', ['Ctrl+`'], { mac: ['Ctrl+`'] }),
  def('new-terminal', 'New terminal', 'strip', ['Ctrl+Shift+`'], { mac: ['Ctrl+Shift+`'] }),

  def('render-source', 'Render, Source', 'tab', ['Ctrl+Shift+V']),
  def('lineage', 'Lineage', 'tab', ['Ctrl+Shift+L']),
  def('add-to-message', 'Add to message', 'tab', ['Ctrl+Shift+Enter']),
  def('comment', 'Comment on the selection', 'tab', ['Ctrl+Alt+M'], { mac: ['Alt+Cmd+A'] }),
  def('comments', 'Comments', 'tab', ['Ctrl+Shift+K']),
  def('copy', 'Copy, with nothing selected', 'tab', ['Ctrl+C']),
  def('maximize', 'Maximize', 'tab', ['Alt+Enter']),
  def('previous-tab', 'Previous tab', 'tab', ['Alt+Left']),
  def('next-tab', 'Next tab', 'tab', ['Alt+Right']),
  def('close-tab', 'Close the tab', 'tab', ['Delete']),
  def('focused-menu', 'Its menu', 'tab', ['Shift+F10'], { mac: ['Ctrl+Enter'] }),
  def('split-menu', 'A chevron', 'tab', ['Alt+Down']),

  def('menu-move', 'Move', 'menu', ['Up', 'Down'], { joiner: 'pair' }),
  def('menu-pick', 'Pick', 'menu', ['Enter']),
  def('menu-submenu', 'Into a submenu, back', 'menu', ['Right', 'Left'], { joiner: 'pair' }),
  def('menu-close', 'Close', 'menu', ['Esc']),
  def('menu-type', 'Change type, at the edge of the text', 'menu', ['Left', 'Right'], {
    joiner: 'pair',
  }),
  def('menu-columns', 'Providers and models column', 'menu', ['Left', 'Right'], {
    joiner: 'pair',
  }),
  def('menu-all-results', 'All results', 'menu', ['Ctrl+Enter']),
  def('menu-all-types', 'Back to all types, in an empty search', 'menu', ['Backspace']),
  def('menu-ask', 'Ask the search assistant, and back', 'menu', ['Tab']),
  def('menu-filters', 'All filters', 'menu', ['Alt+Down']),
  def('menu-drop-filter', 'Drop the last filter, in an empty search', 'menu', ['Backspace']),

  def('graph-move', 'Move between nodes', 'graph', ['Left', 'Right', 'Up', 'Down'], {
    joiner: 'pair',
  }),
  def('graph-open', 'Open the node', 'graph', ['Enter']),
  def('graph-fit', 'Fit the graph', 'graph', ['0']),
];
