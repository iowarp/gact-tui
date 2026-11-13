import { brand } from '@brand';
import { t } from '@lingui/core/macro';
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
  { id: 'anywhere', label: t`Anywhere`, scope: 'anywhere' },
  { id: 'composer', label: t`Composer`, scope: 'local' },
  { id: 'strip', label: t`The strip, by position`, scope: 'anywhere' },
  { id: 'tab', label: t`The tab you're in`, scope: 'tab' },
  { id: 'menu', label: t`In any menu`, scope: 'local' },
  { id: 'graph', label: t`Lineage graph`, scope: 'local' },
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
  /** Show the chords side by side instead of with "or" (`↑ ↓`), or as one cap (`↑↓`). */
  joiner?: 'or' | 'pair' | 'cap';
  /** When the key does this, if not always; the sheet shows it on hover. */
  when?: string;
}

const def = (
  id: string,
  name: string,
  group: ShortcutGroup,
  keys: readonly string[],
  extra: Partial<Pick<ShortcutDefinition, 'mac' | 'host' | 'joiner' | 'when'>> = {},
): ShortcutDefinition => ({ id, name, group, keys, ...extra });

const { wordmark } = brand;

export const SHORTCUT_CATALOG: readonly ShortcutDefinition[] = [
  def('search', t`Search and commands`, 'anywhere', ['Ctrl+K']),
  def('model-picker', t`Open the model picker`, 'anywhere', ["Ctrl+'"], {
    when: t`In a conversation`,
  }),
  def('save-changes', t`Save typed settings`, 'anywhere', ['Ctrl+S']),
  def('new-conversation', t`New conversation`, 'anywhere', ['Ctrl+N'], { host: 'desktop' }),
  def('new-conversation-browser', t`New conversation`, 'anywhere', ['Ctrl+Shift+O'], {
    host: 'browser',
  }),
  def('import-conversation', t`Import conversation…`, 'anywhere', ['Ctrl+I']),
  def('left-pocket', t`Left pocket`, 'anywhere', ['Ctrl+B']),
  def('right-pocket', t`Right pocket`, 'anywhere', ['Ctrl+Shift+B']),
  def('previous-conversation', t`Previous conversation`, 'anywhere', ['Alt+Up'], {
    mac: ['Alt+Cmd+Up'],
  }),
  def('next-conversation', t`Next conversation`, 'anywhere', ['Alt+Down'], {
    mac: ['Alt+Cmd+Down'],
  }),
  def('conversation-runs', t`Runs in this conversation`, 'anywhere', ['Ctrl+.'], {
    mac: ['Shift+Cmd+.'],
  }),
  def('conversation-menu', t`This conversation's menu`, 'anywhere', ['Alt+.'], {
    mac: ['Alt+Cmd+.'],
  }),
  def('composer-focus', t`Back to the composer`, 'anywhere', ['Shift+Esc']),
  def('next-region', t`Next region`, 'anywhere', ['F6']),
  def('previous-region', t`Previous region`, 'anywhere', ['Shift+F6']),
  // On a Mac the menu bar is the app menu, and ⇧⌘/ searches it; the app takes no key.
  // Named after the menu's own trigger, the brand wordmark ("CLIO menu").
  def('app-menu', t`${wordmark} menu`, 'anywhere', ['Alt+Space'], { mac: [] }),
  def('settings', t`Settings`, 'anywhere', ['Ctrl+,']),
  def('infrastructure', t`Infrastructure`, 'anywhere', ['Ctrl+Shift+,']),
  // Ctrl Shift A is the browser's tab search, so notifications take Ctrl Alt N.
  def('notifications', t`Notifications`, 'anywhere', ['Ctrl+Alt+N']),
  def('shortcuts', t`All shortcuts`, 'anywhere', ['Ctrl+/']),
  // i18n-ignore: key notation parsed by parseChord
  def('show-keys', t`Show keys on screen`, 'anywhere', ['hold Ctrl']),
  def('fullscreen', t`Full screen`, 'anywhere', ['F11'], { host: 'desktop', mac: ['Ctrl+Cmd+F'] }),
  def('zoom-in', t`Zoom in`, 'anywhere', ['Ctrl+='], { host: 'desktop' }),
  def('zoom-out', t`Zoom out`, 'anywhere', ['Ctrl+-'], { host: 'desktop' }),
  def('zoom-reset', t`Actual size`, 'anywhere', ['Ctrl+0'], { host: 'desktop' }),
  // The desktop webview has no browser reload or downloads keys of its own.
  def('reload', t`Reload workspace`, 'anywhere', ['Ctrl+R'], { host: 'desktop' }),
  def('downloads', t`Downloads`, 'anywhere', ['Ctrl+J'], { host: 'desktop' }),

  def('send', t`Send`, 'composer', ['Enter']),
  def('steer', t`Steer while it runs`, 'composer', ['Ctrl+Enter']),
  def('new-line', t`New line`, 'composer', ['Shift+Enter']),
  def('mention', t`Mention a file or agent`, 'composer', ['@']),
  def('stop', t`Stop`, 'composer', ['Esc'], { mac: ['Esc', 'Cmd+.'] }),
  def('mode', t`Change mode`, 'composer', ['Ctrl+Shift+M']),
  def('queue-delete', t`Delete the queued message`, 'composer', ['Delete']),
  def('save-draft', t`Save the draft for later`, 'composer', ['Ctrl+S']),
  def('restore-draft', t`Bring back the saved draft`, 'composer', ['Up'], {
    when: t`In an empty composer`,
  }),

  def('strip-position', t`Strip icon by position`, 'strip', ['Ctrl+Shift+1–7'], {
    mac: ['Alt+Cmd+1–7'],
  }),
  def('terminal', t`Terminal`, 'strip', ['Ctrl+`'], { mac: ['Ctrl+`'] }),
  def('new-terminal', t`New terminal`, 'strip', ['Ctrl+Shift+`'], { mac: ['Ctrl+Shift+`'] }),

  def('render-source', t`Render, Source`, 'tab', ['Ctrl+Shift+V']),
  def('lineage', t`Lineage`, 'tab', ['Ctrl+Shift+L']),
  def('show-end', t`Show the last part`, 'tab', ['L'], {
    when: t`On a file too large to show`,
  }),
  def('add-to-message', t`Add to message`, 'tab', ['Ctrl+Shift+Enter']),
  def('comment', t`Comment on the selection`, 'tab', ['Ctrl+Alt+M'], { mac: ['Alt+Cmd+A'] }),
  def('comments', t`Comments`, 'tab', ['Ctrl+Shift+K']),
  def('copy', t`Copy, with nothing selected`, 'tab', ['Ctrl+C']),
  def('maximize', t`Maximize`, 'tab', ['Alt+Enter']),
  def('previous-tab', t`Previous tab`, 'tab', ['Alt+Left']),
  def('next-tab', t`Next tab`, 'tab', ['Alt+Right']),
  // A Mac's ⌫ key sends Backspace, and a bare one would delete in place.
  def('close-tab', t`Close the tab`, 'tab', ['Delete'], { mac: ['Cmd+Backspace'] }),
  def('focused-menu', t`Its menu`, 'tab', ['Shift+F10'], { mac: ['Ctrl+Enter'] }),
  def('split-menu', t`A chevron`, 'tab', ['Alt+Down']),
  def('list-search', t`Search the list`, 'tab', ['/'], { when: t`On the Runs list` }),
  def('view-zoom-in', t`Zoom in`, 'tab', ['Plus'], { when: t`On an image, PDF or diagram` }),
  def('view-zoom-out', t`Zoom out`, 'tab', ['-'], { when: t`On an image, PDF or diagram` }),
  def('view-zoom-fit', t({ message: 'Fit', context: 'verb' }), 'tab', ['0'], {
    when: t`On an image, PDF or diagram`,
  }),
  def('pdf-page', t`Previous, next page`, 'tab', ['PageUp', 'PageDown'], {
    joiner: 'pair',
    when: t`On a PDF`,
  }),

  def('menu-move', t({ message: 'Move', context: 'verb' }), 'menu', ['Up', 'Down'], {
    joiner: 'cap',
  }),
  def('menu-pick', t`Pick`, 'menu', ['Enter']),
  def('menu-fill', t`Fill the command, to add to it`, 'menu', ['Tab']),
  def('menu-submenu', t`Into a submenu, back`, 'menu', ['Right', 'Left'], { joiner: 'pair' }),
  def('menu-open', t`Into a submenu`, 'menu', ['Right']),
  def('menu-back', t`Back out of a submenu`, 'menu', ['Left']),
  def('menu-close', t({ message: 'Close', context: 'verb' }), 'menu', ['Esc']),
  def('menu-group', t`Next, previous group`, 'menu', ['PageDown', 'PageUp'], { joiner: 'pair' }),
  def('menu-inside', t`Look inside a file`, 'menu', ['Tab'], {
    when: t`On an HDF5 file in the @ menu`,
  }),
  def('menu-up', t`Up one level`, 'menu', ['Shift+Tab'], { when: t`Inside a file` }),
  def('menu-type', t`Change type, at the edge of the text`, 'menu', ['Left', 'Right'], {
    joiner: 'pair',
  }),
  def('menu-columns', t`Providers and models column`, 'menu', ['Left', 'Right'], {
    joiner: 'pair',
  }),
  def('menu-all-results', t`All results`, 'menu', ['Ctrl+Enter']),
  def('menu-all-types', t`Back to all types`, 'menu', ['Backspace'], {
    when: t`In an empty search`,
  }),
  def('menu-ask', t`Ask the search assistant, and back`, 'menu', ['Tab']),
  def('menu-filters', t`All filters`, 'menu', ['Alt+Down']),
  def('menu-toggle', t`Toggle a filter`, 'menu', ['Space'], { when: t`In the filters` }),
  def('menu-next-group', t`Next filter group`, 'menu', ['PageDown'], { when: t`In the filters` }),
  def('menu-slide', t`Slide a filter`, 'menu', ['Left', 'Right'], {
    joiner: 'pair',
    when: t`In the filters`,
  }),
  def('menu-drop-filter', t`Drop the last filter`, 'menu', ['Backspace'], {
    when: t`In an empty search`,
  }),

  def('graph-move', t`Move between nodes`, 'graph', ['Left', 'Right', 'Up', 'Down'], {
    joiner: 'pair',
  }),
  def('graph-open', t`Open the node`, 'graph', ['Enter']),
  def('graph-zoom', t`Zoom in, out`, 'graph', ['Plus', '-'], { joiner: 'pair' }),
  def('graph-fit', t`Fit the graph`, 'graph', ['0']),
];
