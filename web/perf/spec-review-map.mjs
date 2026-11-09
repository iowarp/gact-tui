// Which spec blocks (perf/spec-review.mjs spec) each app capture is compared
// with. `spec` entries are "<page>:<regex>" matched against the block id or
// title; `app` is a regex over "<surface>--<state>" from perf/screens.mjs,
// anchored at both ends. Each matching state gets its own pair images.
const blocks =
  (page) =>
  (...numbers) =>
    numbers.map((n) => `${page}:^${String(n).padStart(2, '0')}-`);
const fp = blocks('full-picture');
const cs = blocks('conversation-states');
const ps = blocks('pickers-search');
const st = blocks('settings');
const ci = blocks('connect-infrastructure');
const ra = blocks('runs-attention');
const fb = blocks('workbench-frame-bar');
const rp = blocks('workbench-right-pocket');
const tb = blocks('workbench-tabs');
const ln = blocks('workbench-lineage');
const kb = blocks('workbench-keyboard');

export const surfaces = [
  {
    id: 's1-shell',
    owner: 'S1',
    title: 'Left bar, top bar, status bar, menus',
    pairs: [
      { app: 'session--conversation', spec: [...fp(3, 4, 6)] },
      { app: 'session--sidebar-toggled', spec: [...fp(3)] },
      {
        app: 'session--menu-(search-work|create-or-import|workspace-actions)',
        spec: [...fp(4, 2)],
        maxSpecs: 2,
      },
      {
        app: '(session|keyboard)--menu-(session-actions|conversation-actions)',
        spec: [...cs(9), ...fp(6)],
      },
      { app: 'session--menu-open-questions', spec: [...fp(6)] },
      { app: 'session--menu-(version-status|usage)', spec: [...fp(12)] },
      { app: 'session--dialog-new-(session|workspace)', spec: [...fp(8)] },
      { app: 'keyboard--(mac-)?held-keys', spec: [...kb(1, 4)] },
      { app: 'keyboard--mac-menu-conversation-actions', spec: [...cs(9), ...kb(6)] },
      { app: 'scale--many-sessions-sidebar', spec: [...fp(4)] },
    ],
  },
  {
    id: 's5-transcript',
    owner: 'S5',
    title: 'Transcript',
    pairs: [
      { app: 'session--(conversation|decisions-cleared)', spec: [...cs(2, 7), ...fp(9)] },
      { app: 'session--activity-expanded', spec: [...cs(7, 2)] },
      { app: 'session--attention-technical-details', spec: [...cs(8)] },
      { app: 'session--(loading|load-error)', spec: [...cs(12, 15)] },
      { app: 'session--streaming', spec: [...cs(2, 7)] },
      { app: 'session--transcript-outline', spec: [...fp(11), ...cs(16)] },
      { app: 'scale--long-conversation-tail', spec: [...cs(7), ...fp(9)] },
    ],
  },
  {
    id: 's6-decisions',
    owner: 'S6',
    title: 'Decision cards',
    pairs: [
      { app: 'session--(conversation|decision-permission)', spec: [...cs(1, 20)] },
      { app: 'session--decision-question-tray', spec: [...cs(3, 1)] },
      { app: 'session--attention-technical-details', spec: [...cs(4, 8)] },
    ],
  },
  {
    id: 's7-composer',
    owner: 'S7',
    title: 'Composer',
    pairs: [
      { app: 'session--composer-(draft|add-context)', spec: [...ps(2), ...fp(9)] },
      { app: 'session--composer-mention', spec: [...fp(10), ...ps(11)] },
      { app: 'session--composer-slash-commands', spec: [...fp(10), ...ps(8)] },
      {
        app: 'session--composer-(execution-mode|confirmation-policy|permission-duration|reasoning-effort)',
        spec: [...cs(10), ...fp(9)],
      },
      { app: 'session--queued-messages', spec: [...fp(9)] },
      { app: 'new-conversation--welcome', spec: [...cs(13), ...fp(8)] },
    ],
  },
  {
    id: 's2-workbench',
    owner: 'S2',
    title: 'Workbench pocket and tabs',
    pairs: [
      { app: 'canvas--observability', spec: [...rp(1), ...fb(9, 11)] },
      // #758 harness: strip lists, tab context menu, list beside/over a tab.
      { app: 'canvas--files-list', spec: [...rp(1)] },
      { app: 'canvas--(activity|activity-list|activity-detail)', spec: [...rp(2)] },
      { app: 'canvas--tab-context-menu', spec: [...rp(3), ...tb(1)] },
      { app: 'canvas--file-csv', spec: [...tb(1, 2), ...rp(1)] },
      { app: 'canvas--narrow-sheet', spec: [...rp(3, 1)] },
      { app: 'canvas--list-beside', spec: [...rp(4)] },
      { app: 'canvas--tab-menu', spec: [...rp(3), ...ln(12)] },
      {
        app: 'canvas--(file-explorer|workspace-resources|session-artifacts|work)',
        spec: [...rp(1, 2), ...ln(10)],
      },
      { app: 'canvas--strip-[1-7]', spec: [...rp(1, 2), ...ln(12)] },
      { app: 'canvas--terminal', spec: [...ln(13, 12)] },
      { app: 'canvas--agent-customize', spec: [...rp(2)] },
      { app: 'canvas--maximized', spec: [...rp(4), ...tb(1)] },
      { app: 'scale--large-file-tree', spec: [...rp(1), ...ln(7)] },
    ],
  },
  {
    id: 's11-viewers',
    owner: 'S11',
    title: 'Viewers and the frame bar',
    pairs: [
      { app: 'canvas--file-csv', spec: [...fb(4, 1, 2)] },
      { app: 'canvas--file-image', spec: [...fb(7, 2)] },
      { app: 'canvas--file-csv-source', spec: [...ln(2), ...fb(5)] },
      { app: 'canvas--file-csv-lineage', spec: [...ln(2, 3)] },
      { app: 'scale--large-csv', spec: [...fb(4, 8), ...ln(4)] },
    ],
  },
  {
    id: 's3-settings-chrome-pickers',
    owner: 'S3',
    title: 'Settings chrome and parts, pickers, Ctrl K',
    pairs: [
      { app: 'settings--general', spec: [...st(1, 6, 16)] },
      { app: 'keyboard--settings-window', spec: [...st(1, 2)] },
      { app: 'settings--search-everywhere', spec: [...st(3), ...ps(1)] },
      { app: 'settings--search-typed', spec: [...st(6, 3)] },
      { app: 'keyboard--(mac-)?command-palette-no-match', spec: [...ps(10, 1)] },
      { app: 'keyboard--(mac-)?command-palette', spec: [...ps(1, 3, 13)] },
      { app: 'keyboard--(mac-)?command-palette-typed', spec: [...ps(10, 7)] },
      { app: 'keyboard--(mac-)?command-palette-actions', spec: [...ps(8, 9)] },
      { app: 'keyboard--(mac-)?shortcut-sheet', spec: [...kb(5, 6)] },
      { app: 'keyboard--(mac-)?composer-model-picker', spec: [...ps(3, 4, 5)] },
      { app: 'session--composer-model-picker', spec: [...ps(3, 6)] },
      { app: 'scale--many-sessions-search', spec: [...ps(1, 10)] },
    ],
  },
  {
    id: 's8-settings-models',
    owner: 'S8',
    title: 'Settings: models and providers',
    pairs: [
      { app: 'settings--(providers|models|model-providers|usage)', spec: [...st(5), ...ci(12)] },
      { app: 'settings--models-default-picker', spec: [...ps(3, 4), ...ci(12)] },
    ],
  },
  {
    id: 's9-settings-extensions',
    owner: 'S9',
    title: 'Settings: MCP, tools, extensions, agents',
    pairs: [
      {
        app: 'settings--(plugins|extensions|tools.*|mcp.*|remote-tools|data-sources|prompts.*|skills)',
        spec: [...st(9, 7, 8)],
      },
      { app: 'settings--(agents|agent-connections|fleet)', spec: [...st(11)] },
    ],
  },
  {
    id: 's10-settings-other',
    owner: 'S10',
    title: 'Settings: other sections',
    pairs: [
      {
        app: 'settings--(general|appearance|notifications|connections?|relays|(new-)?session-defaults|execution-and-history|runtime|browser|scheduled-work|permissions|system|about|profile|folders|health)',
        spec: [...st(4, 12, 17)],
      },
      { app: 'settings--memory.*', spec: [...st(14, 15)] },
    ],
  },
  {
    id: 's4-connect-runs',
    owner: 'S4',
    title: 'Connect, Infrastructure, runs, bell, CLIO menu',
    pairs: [
      { app: 'session--menu-service-status', spec: [...fp(5), ...ci(1, 16)] },
      { app: 'session--menu-clio-add-agent', spec: [...ci(1, 4)] },
      { app: 'session--infrastructure-status-expanded', spec: [...ci(3, 9)] },
      { app: 'infrastructure--.*', spec: [...ci(9, 11, 13)] },
      { app: 'runs--(executions|state-filter)', spec: [...ra(2, 1, 6)] },
      { app: 'runs--flows', spec: [...ra(4, 9)] },
      { app: 'runs--details', spec: [...ra(5, 4)] },
      { app: 'keyboard--conversation-runs', spec: [...ra(3, 1)] },
      {
        app: '(session--menu-attention-inbox|keyboard--notifications)',
        spec: [...ra(7), ...fp(13)],
      },
    ],
  },
  {
    id: 'm-boot',
    owner: 'M',
    title: 'Boot and connect screen, sandbox banner',
    pairs: [
      { app: 'connect--(first-run|unreachable-service)', spec: [...ci(4, 5)] },
      { app: 'not-found--unknown-route', spec: [...cs(15)] },
    ],
  },
];
