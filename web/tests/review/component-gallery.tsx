import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BotIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  FolderIcon,
  GitBranchIcon,
  LayoutGridIcon,
  ListIcon,
  MessageSquareIcon,
  PanelRightIcon,
  PlayIcon,
  SearchIcon,
  TerminalIcon,
} from 'lucide-react';
import { ForcedTheme } from '../../src/theme/forced-theme';
import '../../src/index.css';
import { Button } from '../../src/components/ui/button';
import { Input } from '../../src/components/ui/input';
import { SettingsRow } from '../../src/components/clio/settings-row';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../src/components/ui/dropdown-menu';
import { Command, CommandGroup, CommandItem, CommandList } from '../../src/components/ui/command';
import { KeyPlatformContext } from '../../src/lib/shortcuts/hooks';
import type { KeyPlatform } from '../../src/lib/shortcuts/keys';
import {
  AddIcon,
  DeleteIcon,
  EditIcon,
  InfoIcon,
  MoreIcon,
  RefreshIcon,
  SettingsIcon,
} from '../../src/lib/icon-vocabulary';
import { HeldKeyBadge, KeyCap, ShortcutKeys } from '../../src/components/clio/primitives/key-chip';
import { IconButton } from '../../src/components/clio/primitives/icon-button';
import { SplitButton } from '../../src/components/clio/primitives/split-button';
import { SegmentedControl } from '../../src/components/clio/primitives/segmented-control';
import {
  StatusIndicator,
  type StatusTone,
} from '../../src/components/clio/primitives/status-indicator';
import { MetaValue, Tag, type TagTone } from '../../src/components/clio/primitives/tag';
import { MiddleTruncate, TruncatedText } from '../../src/components/clio/primitives/truncate';
import { MenuRow } from '../../src/components/clio/primitives/menu-row';
import { ListRow } from '../../src/components/clio/primitives/list-row';
import { ActivityRow } from '../../src/components/clio/activity-row';
import {
  FrameBar,
  FrameCrumbs,
  FrameDivider,
  FrameTab,
} from '../../src/components/clio/primitives/frame-bar';
import { DialogFrame, WindowShell } from '../../src/components/clio/primitives/dialog-frame';
import { DetailPane, ListDetailLayout } from '../../src/components/clio/primitives/detail-pane';
import { ItemList, ItemRow } from '../../src/components/clio/primitives/item-row';
import { StateView, type StateKind } from '../../src/components/clio/primitives/state-view';
import { ShortcutSheet } from '../../src/components/clio/primitives/shortcut-sheet';

// Synthetic labels exercise the shared primitives; nothing here talks to an agent.
const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
const platform: KeyPlatform = params.get('platform') === 'mac' ? 'mac' : 'windows';
const view = params.get('view') ?? 'gallery';
const noop = () => undefined;

const LONG_NAME =
  'Calibration of the north-ridge seismometer array against the reference station for the quarterly campaign';
const LONG_PATH =
  'campaigns/spotter/2025-q3/north-ridge/calibration/station-comparisons/reference-offsets-final.parquet';

const TOKENS = [
  ['background', 'bg-background'],
  ['card', 'bg-card'],
  ['popover', 'bg-popover'],
  ['muted', 'bg-muted'],
  ['hover', 'bg-hover'],
  ['menu-highlight', 'bg-menu-highlight'],
  ['key', 'bg-key'],
  ['border', 'bg-border'],
  ['faint', 'bg-faint'],
  ['muted-foreground', 'bg-muted-foreground'],
  ['foreground', 'bg-foreground'],
  ['primary', 'bg-primary'],
  ['accent', 'bg-accent'],
  ['action', 'bg-action'],
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
  ['info', 'bg-info'],
  ['destructive', 'bg-destructive'],
] as const;

const STATUS_TONES: { tone: StatusTone; label: string }[] = [
  { tone: 'running', label: 'Running' },
  { tone: 'waiting', label: 'Needs you' },
  { tone: 'success', label: 'Done' },
  { tone: 'warning', label: 'Partial' },
  { tone: 'error', label: 'Failed' },
  { tone: 'info', label: 'Queued' },
  { tone: 'idle', label: 'Idle' },
  { tone: 'stopped', label: 'Stopped' },
];

const TAG_TONES: { tone: TagTone; text: string }[] = [
  { tone: 'neutral', text: 'Draft' },
  { tone: 'on', text: 'On' },
  { tone: 'off', text: 'Off' },
  { tone: 'info', text: 'New' },
  { tone: 'success', text: 'Passed' },
  { tone: 'warning', text: 'Stale' },
  { tone: 'danger', text: 'Failed' },
];

const STATES: { kind: StateKind; title: string; detail?: string; action?: string }[] = [
  { kind: 'loading', title: 'Loading the conversation' },
  { kind: 'empty', title: 'No files yet', detail: 'Files the agent writes appear here.' },
  {
    kind: 'error',
    title: 'Could not read the file',
    detail: 'The workspace stopped responding.',
    action: 'Retry',
  },
  { kind: 'unavailable', title: 'Preview unavailable', action: 'Why?' },
  {
    kind: 'too-large',
    title: 'Too large to show here (2.4 GB)',
    detail: 'Download it or open it in an application.',
    action: 'Download',
  },
  { kind: 'no-preview', title: 'No preview for .h5 files', action: 'Show details' },
  {
    kind: 'changed-elsewhere',
    title: 'Changed on disk',
    detail: 'Another tool rewrote this file.',
    action: 'Reload',
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="rounded-xl border border-border bg-card p-3">{children}</div>
    </section>
  );
}

function Tokens() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
      {TOKENS.map(([name, className]) => (
        <div key={name} className="flex min-w-0 items-center gap-2 text-[12px]">
          <span className={`size-5 shrink-0 rounded-[5px] border border-border ${className}`} />
          <TruncatedText>{name}</TruncatedText>
        </div>
      ))}
    </div>
  );
}

function Buttons() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button>Run analysis</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Delete</Button>
        <Button disabled>Disabled</Button>
        <Button size="sm" variant="outline">
          Small
        </Button>
        <Button size="xs" variant="outline">
          Extra small
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1" data-testid="icon-buttons">
        <IconButton label="Search" icon={<FileTextIcon />} shortcut="search" />
        <IconButton
          label="Right pocket"
          icon={<PanelRightIcon />}
          shortcut="right-pocket"
          aria-pressed
        />
        <IconButton label="Copy" icon={<CopyIcon />} shortcut="copy" />
        <IconButton label="Refresh" icon={<RefreshIcon />} />
        <IconButton label="Settings" icon={<SettingsIcon />} shortcut="settings" />
        <IconButton label="More" icon={<MoreIcon />} size="sm" />
        <IconButton label="Downloads" icon={<DownloadIcon />} count={3} />
        <IconButton label="Delete" icon={<DeleteIcon />} disabled />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SplitButton label="Copy" icon={<CopyIcon />} menuLabel="Copy as" onClick={noop}>
          <DropdownMenuItem>
            <MenuRow label="Copy as Markdown" />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <MenuRow label="Copy path" />
          </DropdownMenuItem>
        </SplitButton>
        <SplitButton label="Open" showLabel variant="outline" menuLabel="Open with" onClick={noop}>
          <DropdownMenuItem>
            <MenuRow label="Open in editor" />
          </DropdownMenuItem>
        </SplitButton>
        <SplitButton
          label="Run"
          icon={<PlayIcon />}
          showLabel
          variant="default"
          menuLabel="Run options"
          onClick={noop}
        >
          <DropdownMenuItem>
            <MenuRow label="Run on cluster" />
          </DropdownMenuItem>
        </SplitButton>
      </div>
    </div>
  );
}

function Controls() {
  const [mode, setMode] = useState<'render' | 'source' | 'lineage'>('render');
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl
        label="View"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: 'render', label: 'Render', icon: <EyeIcon /> },
          { value: 'source', label: 'Source', icon: <CodeIcon />, shortcut: 'render-source' },
          { value: 'lineage', label: 'Lineage', icon: <GitBranchIcon />, disabled: true },
        ]}
      />
      <SegmentedControl
        label="Layout"
        iconOnly
        value={layout}
        onValueChange={setLayout}
        options={[
          { value: 'list', label: 'List', icon: <ListIcon /> },
          { value: 'grid', label: 'Grid', icon: <LayoutGridIcon /> },
        ]}
      />
    </div>
  );
}

function Keys() {
  const ids = [
    'search',
    'right-pocket',
    'settings',
    'previous-conversation',
    'app-menu',
    'fullscreen',
    'send',
  ];
  return (
    <div className="space-y-2 text-[12.5px]">
      {ids.map((id) => (
        <div
          key={id}
          className="grid grid-cols-[minmax(0,150px)_auto_minmax(0,1fr)] items-center gap-3"
        >
          <TruncatedText className="text-muted-foreground">{id}</TruncatedText>
          <ShortcutKeys id={id} variant="caps" />
          <ShortcutKeys id={id} variant="text" className="text-muted-foreground" />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-muted-foreground">Inline:</span>
        <span>
          Press <ShortcutKeys id="shortcuts" variant="inline" /> for every key.
        </span>
        <KeyCap>Esc</KeyCap>
        <HeldKeyBadge id="previous-conversation" />
      </div>
    </div>
  );
}

function Statuses() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12.5px]">
        {STATUS_TONES.map(({ tone, label }) => (
          <StatusIndicator key={tone} tone={tone} label={label} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {TAG_TONES.map(({ tone, text }) => (
          <Tag key={tone} tone={tone}>
            {text}
          </Tag>
        ))}
        <Tag tone="warning" title="Needs you to approve">
          Needs you to approve
        </Tag>
        <Tag width="auto" tone="info">
          Auto width
        </Tag>
        <MetaValue>4m</MetaValue>
        <MetaValue width={52}>12 GB</MetaValue>
        <MetaValue width={64}>1,204</MetaValue>
      </div>
      <div className="max-w-sm space-y-1 text-[12.5px]">
        <TruncatedText>{LONG_NAME}</TruncatedText>
        <MiddleTruncate className="font-mono text-[12px]">{LONG_PATH}</MiddleTruncate>
      </div>
    </div>
  );
}

function Rows() {
  const actions = (
    <>
      <IconButton label="Rename" icon={<EditIcon />} size="sm" />
      <IconButton label="Delete" icon={<DeleteIcon />} size="sm" />
    </>
  );
  const info = <IconButton label="About this row" icon={<InfoIcon />} size="sm" />;
  return (
    <div role="listbox" aria-label="Sample rows" data-testid="list-rows" className="space-y-px">
      {STATUS_TONES.slice(0, 5).map(({ tone, label }, index) => (
        <ListRow
          key={tone}
          role="option"
          tabIndex={-1}
          selected={index === 1}
          status={<StatusIndicator tone={tone} label={label} display="column" />}
          icon={index % 2 ? <TerminalIcon /> : <MessageSquareIcon />}
          title={index === 0 ? LONG_NAME : `Station ${index + 1} comparison`}
          description={index === 2 ? LONG_PATH : index === 3 ? 'claude-sonnet' : undefined}
          badge={<Tag tone={TAG_TONES[index + 1]!.tone}>{TAG_TONES[index + 1]!.text}</Tag>}
          meta={<MetaValue>{`${index * 7 + 2}m`}</MetaValue>}
          actions={actions}
          actionsWidth={52}
          info={info}
        />
      ))}
    </div>
  );
}

/** Transcript rows in a pane under 280px: a row with a target keeps it; one without keeps its name. */
function NarrowActivityRows() {
  const status = <StatusIndicator tone="success" label="Done" display="column" mark="glyph" />;
  return (
    <div data-testid="narrow-activity-rows" className="w-[260px] rounded-md border border-border">
      <ActivityRow icon={<SearchIcon />} name="Search EarthScope catalog" status={status} />
      <ActivityRow
        icon={<TerminalIcon />}
        name="Run command"
        argument="srun -n 4 python regrid.py --ranks 4"
        status={status}
      />
    </div>
  );
}

const PANE_TABS = [
  { value: 'capabilities', label: 'Capabilities' },
  { value: 'tools', label: 'Tools' },
  { value: 'files', label: 'Files' },
] as const;

function ListAndDetail() {
  const [open, setOpen] = useState<string | null>('home-assistant');
  const [tab, setTab] = useState<(typeof PANE_TABS)[number]['value']>('capabilities');
  const plugins = ['home-assistant', 'ndp-explorer', LONG_NAME];
  return (
    <ListDetailLayout
      className="h-72 rounded-xl border border-border"
      list={
        <ItemList label="Plugins" className="p-1.5">
          {plugins.map((name, index) => (
            <ItemRow
              key={name}
              icon={<LayoutGridIcon />}
              title={name}
              meta={index === 2 ? LONG_PATH : 'Plugin, 2 tools'}
              selected={open === name}
              status={
                <StatusIndicator
                  tone={index === 1 ? 'warning' : 'success'}
                  label={index === 1 ? 'Update' : 'Enabled'}
                />
              }
              actions={
                <IconButton
                  label="Explore"
                  icon={<PanelRightIcon />}
                  size="sm"
                  onClick={() => setOpen(name)}
                />
              }
              actionsWidth={30}
            />
          ))}
        </ItemList>
      }
      detail={
        open ? (
          <DetailPane
            icon={<LayoutGridIcon />}
            title={open}
            onClose={() => setOpen(null)}
            actions={<IconButton label="Update" icon={<RefreshIcon />} />}
            tabs={
              <SegmentedControl
                label="Plugin contents"
                options={PANE_TABS}
                value={tab}
                onValueChange={setTab}
              />
            }
          >
            <ItemList label="Capabilities">
              <ItemRow size="sm" icon={<CodeIcon />} title="ha-lights" meta="Skill" />
              <ItemRow size="sm" icon={<TerminalIcon />} title="home-assistant" meta="MCP server" />
            </ItemList>
          </DetailPane>
        ) : null
      }
    />
  );
}

function LineRows() {
  const rows = [
    { name: 'Ollama', meta: 'localhost:11434', tone: 'success', label: 'Running' },
    { name: 'LM Studio', meta: 'localhost:1234', tone: 'stopped', label: 'Stopped' },
    { name: LONG_NAME, meta: LONG_PATH, tone: 'error', label: 'Unreachable' },
  ] as const;
  return (
    <ItemList label="Local model servers" className="max-w-xl p-1.5">
      {rows.map((row, index) => (
        <ItemRow
          key={row.name}
          size="line"
          icon={<TerminalIcon />}
          title={row.name}
          meta={row.meta}
          selected={index === 0}
          status={<StatusIndicator tone={row.tone} label={row.label} />}
          statusWidth={112}
          actions={<IconButton label="Edit" icon={<EditIcon />} size="sm" />}
          actionsWidth={30}
          slot={
            <Button size="xs" variant="outline">
              Use
            </Button>
          }
          slotWidth={48}
        />
      ))}
    </ItemList>
  );
}

function Menus() {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <Command
        label="Static menu sample"
        className="h-auto w-[min(100%,340px)] rounded-xl border border-border bg-popover p-[5px]"
      >
        <CommandList className="max-h-none">
          <CommandGroup heading="Conversation">
            <CommandItem>
              <MenuRow icon={<AddIcon />} label="New conversation" shortcut="new-conversation" />
            </CommandItem>
            <CommandItem>
              <MenuRow icon={<FolderIcon />} label="Workspace" description={LONG_PATH} submenu />
            </CommandItem>
            <CommandItem>
              <MenuRow
                icon={<BotIcon />}
                label="Auto-approve reads"
                tag={{ text: 'On', tone: 'on' }}
              />
            </CommandItem>
            <CommandItem>
              <MenuRow label="Compact context" value="12 GB" checked={false} />
            </CommandItem>
            <CommandItem>
              <MenuRow
                label="Show reasoning"
                checked
                info={<InfoIcon className="size-3.5 text-muted-foreground" />}
              />
            </CommandItem>
            <CommandItem>
              <MenuRow icon={<SettingsIcon />} label="Settings" shortcut="settings" />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
      <DropdownMenu defaultOpen={view === 'menu'} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Open menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Conversation</DropdownMenuLabel>
          <DropdownMenuItem>
            <MenuRow icon={<AddIcon />} label="New conversation" shortcut="new-conversation" />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <MenuRow icon={<DownloadIcon />} label="Export" submenu />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <MenuRow label="Notifications" tag={{ text: 'Off', tone: 'off' }} />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            <MenuRow icon={<DeleteIcon />} label="Delete conversation" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Frames() {
  const [tab, setTab] = useState('notes');
  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label="Open files"
        className="flex min-w-0 overflow-hidden border-b border-border"
      >
        {[
          { id: 'plan', label: 'plan.md', pinned: true },
          { id: 'notes', label: 'analysis-notes.md', dirty: true },
          { id: 'plot', label: 'station-offsets-by-campaign-and-instrument.png' },
          { id: 'data', label: 'offsets.parquet', changed: true },
          { id: 'compact', label: 'soil_qc.py', compact: true },
        ].map((item) => (
          <FrameTab
            key={item.id}
            label={item.label}
            icon={<FileTextIcon />}
            active={tab === item.id}
            dirty={item.dirty}
            changed={item.changed}
            pinned={item.pinned}
            compact={item.compact}
            onSelect={() => setTab(item.id)}
            onClose={noop}
          />
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <FrameBar
          label="File"
          where={
            <FrameCrumbs
              parts={[
                { label: 'spotter', onSelect: noop },
                { label: 'calibration', onSelect: noop },
                { label: 'reference-offsets-final.parquet' },
              ]}
            />
          }
          what={<span className="truncate text-muted-foreground">12,480 rows · 14 columns</span>}
          format={<Tag tone="neutral">Parquet</Tag>}
          actions={
            <>
              <FrameDivider />
              <IconButton label="Copy" icon={<CopyIcon />} size="sm" shortcut="copy" />
              <IconButton label="Download" icon={<DownloadIcon />} size="sm" />
              <IconButton label="More" icon={<MoreIcon />} size="sm" />
            </>
          }
        />
        <StateView kind="loading" title="Reading the first 1,000 rows" size="row" />
      </div>
    </div>
  );
}

function States() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
      {STATES.map((state) => (
        <div key={state.kind} className="min-h-40 rounded-lg border border-border">
          <StateView
            kind={state.kind}
            title={state.title}
            detail={state.detail}
            action={state.action ? { label: state.action, onClick: noop } : undefined}
            size="panel"
          />
        </div>
      ))}
    </div>
  );
}

function Overlays() {
  const [dialog, setDialog] = useState(view === 'dialog');
  const [destructive, setDestructive] = useState(view === 'confirm');
  const [settingsOpen, setSettingsOpen] = useState(view === 'window');
  const [sheet, setSheet] = useState(view === 'shortcuts');
  const [section, setSection] = useState('general');
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setDialog(true)}>
        Dialog
      </Button>
      <Button variant="outline" onClick={() => setDestructive(true)}>
        Destructive confirm
      </Button>
      <Button variant="outline" onClick={() => setSettingsOpen(true)}>
        Settings window
      </Button>
      <Button variant="outline" onClick={() => setSheet(true)}>
        Shortcut sheet
      </Button>
      <DialogFrame
        open={dialog}
        onOpenChange={setDialog}
        icon={<FolderIcon />}
        title="Add server"
        help="A server adds its tools to every conversation on this agent."
        confirm={{ label: 'Add', onConfirm: noop }}
      >
        <SettingsRow htmlFor="gallery-server-name" title="Name">
          <Input defaultValue="home-assistant" id="gallery-server-name" />
        </SettingsRow>
        <SettingsRow title="Folder">
          <MiddleTruncate className="font-mono text-[12px] text-muted-foreground">
            {LONG_PATH}
          </MiddleTruncate>
        </SettingsRow>
      </DialogFrame>
      <DialogFrame
        open={destructive}
        onOpenChange={setDestructive}
        icon={<DeleteIcon />}
        title={`Delete “${LONG_NAME}”?`}
        description="The transcript and its 14 files are removed from this workspace."
        confirm={{ label: 'Delete', tone: 'destructive', onConfirm: noop }}
      />
      <WindowShell
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="Settings"
        navigation={
          <div className="space-y-px">
            {['general', 'appearance', 'models', 'keyboard'].map((id) => (
              <ListRow
                key={id}
                role="option"
                tabIndex={-1}
                selected={section === id}
                title={id[0]!.toUpperCase() + id.slice(1)}
                onClick={() => setSection(id)}
              />
            ))}
          </div>
        }
      >
        <div className="space-y-1 p-4">
          <ListRow title="Theme" description="Follow the system" badge={<Tag tone="on">On</Tag>} />
          <ListRow title="Reduce motion" badge={<Tag tone="off">Off</Tag>} />
          <ListRow title="Show keys while holding Ctrl" badge={<Tag tone="on">On</Tag>} />
        </div>
      </WindowShell>
      <ShortcutSheet open={sheet} onOpenChange={setSheet} />
    </div>
  );
}

function Gallery() {
  return (
    <ForcedTheme theme={theme}>
      <KeyPlatformContext.Provider value={platform}>
        <TooltipProvider delayDuration={0}>
          <main className="mx-auto max-w-5xl space-y-5 bg-background p-4 text-foreground">
            <header className="space-y-1">
              <h1 className="text-[15px] font-medium">Shared component gallery</h1>
              <p className="text-[12.5px] text-muted-foreground">
                {theme === 'dark' ? 'Dark' : 'Light'} theme,{' '}
                {platform === 'mac' ? 'Mac' : 'Windows/Linux'} keys. Synthetic labels; nothing here
                changes files.
              </p>
            </header>
            <Section title="Tokens">
              <Tokens />
            </Section>
            <Section title="Buttons">
              <Buttons />
            </Section>
            <Section title="Segmented controls">
              <Controls />
            </Section>
            <Section title="Keys">
              <Keys />
            </Section>
            <Section title="Status, tags and truncation">
              <Statuses />
            </Section>
            <Section title="List rows">
              <Rows />
            </Section>
            <Section title="Narrow activity rows">
              <NarrowActivityRows />
            </Section>
            <Section title="List and detail pane">
              <ListAndDetail />
            </Section>
            <Section title="One-line item rows">
              <LineRows />
            </Section>
            <Section title="Menus">
              <Menus />
            </Section>
            <Section title="Frame bar and tabs">
              <Frames />
            </Section>
            <Section title="States">
              <States />
            </Section>
            <Section title="Dialogs and windows">
              <Overlays />
            </Section>
          </main>
        </TooltipProvider>
      </KeyPlatformContext.Provider>
    </ForcedTheme>
  );
}

document.body.className = 'bg-background';
createRoot(document.getElementById('root')!).render(<Gallery />);
