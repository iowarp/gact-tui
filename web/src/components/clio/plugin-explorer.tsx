import type { McpServerDefinition, PluginEntry, PluginInspection } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  BotIcon,
  BoxesIcon,
  FileIcon,
  LayersIcon,
  ServerIcon,
  SparklesIcon,
  TerminalIcon,
  WorkflowIcon,
} from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { FileTree, FileTreeFile, FileTreeFolder } from '@/components/ai-elements/file-tree';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRepository } from '@/hooks/use-repository';
import { usePluginCatalog, useExtensionsSupported } from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import {
  copyReference,
  formatName,
  markdownSummary,
  pluginStatus,
  sourceName,
} from '@/lib/extension-library-entries';
import { EditIcon, MoreIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { serviceStatus, specTarget } from '@/lib/mcp-service-presentation';
import { catalogMember } from '@/lib/plugin-catalog-tree';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ExtensionRow, MetaLine, SlotButton, TrustBanner } from './extension-parts';
import { FileViewerShell } from './file-viewer-shell';
import { PluginSourceEditor } from './plugin-source-editor';
import { PluginToolSettings } from './plugin-tool-settings';
import { DetailPane } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { ItemList } from './primitives/item-row';
import { SegmentedControl } from './primitives/segmented-control';
import { StateView } from './primitives/state-view';
import { ScopedDocumentNavigation } from './scoped-document-navigation';
import { SettingsGroupLabel } from './settings-row';

const FileReader = lazy(async () => ({ default: (await import('./file-text-view')).FileTextView }));
type SourceFile = PluginInspection['files'][number];
type Tab = 'capabilities' | 'tools' | 'files';

function partFile(
  files: readonly SourceFile[],
  folder: string,
  name: string,
): SourceFile | undefined {
  const bare = name.replace(/^\//u, '');
  return files.find(
    (file) =>
      file.path === `${folder}/${bare}/SKILL.md` ||
      file.path === `${folder}/${bare}.md` ||
      file.path.endsWith(`/${folder}/${bare}/SKILL.md`) ||
      file.path.endsWith(`/${folder}/${bare}.md`),
  );
}

export interface PluginDetailPaneProps {
  reference: string;
  pending?: boolean;
  initialSkill?: string;
  onClose: () => void;
  /** Update the plugin's marketplace. */
  onUpdate?: () => void;
  updating?: boolean;
  /** Ask before trusting the plugin's source; without it, trust happens here. */
  onTrust?: (plugin: PluginEntry) => void;
  /** Run the plugin check for the plugin's marketplace. */
  onCheck?: () => void;
  className?: string;
}

/**
 * One plugin beside the list (or in a dialog): what it brings, its tools and its
 * files. Pack members and skills open in place.
 */
export function PluginDetailPane({
  reference,
  pending = false,
  initialSkill,
  onClose,
  onUpdate,
  updating = false,
  onTrust,
  onCheck,
  className,
}: PluginDetailPaneProps) {
  const [selected, setSelected] = useState<{ reference: string; pending: boolean; skill?: string }>(
    { reference, pending, skill: initialSkill },
  );
  const [tab, setTab] = useState<Tab>(initialSkill ? 'files' : 'capabilities');
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const catalog = usePluginCatalog();
  const supported = useExtensionsSupported();
  const inspection = useQuery({
    queryKey: [
      'plugin-inspection',
      connectionScope(settings),
      selected.reference,
      selected.pending,
      selected.skill,
    ],
    queryFn: ({ signal }) =>
      selected.skill
        ? repository.inspectPlugin(selected.reference, selected.pending, signal, selected.skill)
        : repository.inspectPlugin(selected.reference, selected.pending, signal),
  });
  const servers = useQuery({
    queryKey: queryKeys.key('mcp-servers', settings.endpoint, 'global'),
    queryFn: ({ signal }) => repository.mcpServers(undefined, signal),
    staleTime: 30_000,
  });
  const plugin = inspection.data?.plugin;
  const [path, setPath] = useState('');
  const [editing, setEditing] = useState(false);
  const [variation, setVariation] = useState('');
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedCopy, setSavedCopy] = useState('');
  const [trusting, setTrusting] = useState(false);
  const [trustError, setTrustError] = useState('');
  const files = inspection.data?.files ?? [];
  const file =
    files.find((f) => f.path === path) ??
    files.find((f) => /(?:README|SKILL)\.md$/iu.test(f.path)) ??
    files[0];
  const reset = () => {
    setEditing(false);
    setChanges({});
    setSaveError('');
    setPath('');
  };
  const open = (entry: PluginEntry) => {
    reset();
    setSelected({ reference: entry.ref, pending: entry.pending_trust });
    setTab('capabilities');
  };
  const openSkill = (skill: string) => {
    reset();
    setSelected({ ...selected, skill });
    setTab('files');
  };
  async function trustSource() {
    if (!plugin) return;
    if (onTrust) {
      onTrust(plugin);
      return;
    }
    setTrusting(true);
    setTrustError('');
    try {
      await repository.trustPluginMarketplace(plugin.marketplace);
      await Promise.all(
        (['plugins', 'plugin-marketplaces', 'agents', 'agent-resolution'] as const).map((key) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.key(key, settings.endpoint) }),
        ),
      );
      await inspection.refetch();
    } catch (reason) {
      setTrustError(reason instanceof Error ? reason.message : 'Could not trust source');
    } finally {
      setTrusting(false);
    }
  }
  async function saveVariation() {
    setSaving(true);
    setSaveError('');
    try {
      await repository.createLocalExtension({
        name: variation,
        files: Object.fromEntries(files.map((row) => [row.path, changes[row.path] ?? row.text])),
      });
      await Promise.all(
        (['plugins', 'plugin-marketplaces', 'agents'] as const).map((key) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.key(key, settings.endpoint) }),
        ),
      );
      setEditing(false);
      setChanges({});
      const ref = `private-local/${variation.trim()}`;
      setSavedCopy(ref);
      setSelected({ reference: ref, pending: false, skill: selected.skill });
      setPath('');
      toast.success('Saved to Private local marketplace');
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Could not save variation');
    } finally {
      setSaving(false);
    }
  }
  const hasTools = Boolean(
    plugin && !selected.skill && (plugin.tools.length || plugin.mcp_servers.length),
  );
  const editable =
    supported === true &&
    !inspection.data?.incomplete &&
    !files.some((row) => row.truncated || row.error);
  const startEditing = () => {
    if (!plugin) return;
    setEditing(true);
    setSavedCopy('');
    setChanges({});
    setVariation(`${selected.skill || plugin.id}-local`);
    setTab('files');
  };
  const needsTrust = Boolean(plugin && (!plugin.trusted || plugin.pending_trust));
  // Until the plugin loads, its reference (marketplace/name) gives the name the row showed.
  const title =
    selected.skill ||
    plugin?.id ||
    selected.reference.slice(selected.reference.lastIndexOf('/') + 1) ||
    selected.reference;
  const tabs: { value: Tab; label: string }[] = [
    { value: 'capabilities', label: 'Capabilities' },
    ...(hasTools ? [{ value: 'tools' as const, label: 'Tools' }] : []),
    { value: 'files', label: files.length ? `Files (${files.length})` : 'Files' },
  ];
  const current = tabs.some((row) => row.value === tab) ? tab : 'capabilities';
  return (
    <DetailPane
      className={className}
      icon={
        selected.skill ? <SparklesIcon /> : plugin?.kind === 'pack' ? <BoxesIcon /> : <LayersIcon />
      }
      onClose={onClose}
      title={title}
      actions={
        <>
          {selected.skill ? (
            <IconButton
              icon={<ArrowLeftIcon />}
              label="Back to plugin"
              onClick={() => {
                reset();
                setSelected({ ...selected, skill: undefined });
                setTab('capabilities');
              }}
            />
          ) : null}
          {onUpdate && plugin && plugin.marketplace !== 'private-local' ? (
            <IconButton
              disabled={updating}
              icon={<RefreshIcon />}
              label={updating ? 'Updating…' : 'Update'}
              onClick={onUpdate}
            />
          ) : null}
          {plugin ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <IconButton icon={<MoreIcon />} label={`More actions for ${title}`} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem disabled={!editable || editing} onSelect={startEditing}>
                  <EditIcon />
                  Edit a local copy
                </DropdownMenuItem>
                {onCheck ? (
                  <DropdownMenuItem onSelect={onCheck}>Check plugins</DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => copyReference(plugin.ref)}>
                  Copy reference
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      }
    >
      {plugin ? (
        <MetaLine
          className="block truncate text-xs text-faint"
          parts={[
            selected.skill ? `Skill of ${plugin.id}` : plugin.kind === 'pack' ? 'Pack' : 'Plugin',
            sourceName(plugin.marketplace),
            formatName(plugin.format),
            plugin.version ? `Version ${plugin.version}` : '',
          ]}
        />
      ) : null}
      <div className="mt-3">
        {plugin && needsTrust ? (
          <TrustBanner
            action={
              <SlotButton
                disabled={trusting}
                label={
                  plugin.pending_trust
                    ? `Trust the update from ${plugin.marketplace}`
                    : `Trust ${plugin.marketplace}`
                }
                onClick={() => void trustSource()}
              >
                {trusting ? 'Trusting…' : 'Trust'}
              </SlotButton>
            }
            detail={`Trusting ${plugin.marketplace} lets its plugins run commands, start servers and run hooks on this service.`}
            error={trustError}
            message={
              plugin.pending_trust
                ? 'Its update can run commands and hooks. Trust only sources you know.'
                : 'Its plugins can run commands and hooks. Trust only sources you know.'
            }
          />
        ) : null}
        {savedCopy ? (
          <div className="mb-3 border-b border-border pb-2.5 text-[0.8125rem]" role="status">
            <p>
              Saved <span className="font-medium break-all">{savedCopy}</span> in your Private local
              marketplace. Your repository and current conversation are unchanged.
            </p>
            <details className="mt-1.5">
              <summary className="cursor-pointer text-muted-foreground">
                Use this copy in an agent
              </summary>
              <p className="mt-1.5">
                In the conversation, open Customize → Add plugin and choose {savedCopy}. If it needs
                trust, use Trust first. Save the agent as a local variation to reuse that setup in
                new conversations.
              </p>
              <p className="mt-1.5 text-muted-foreground">
                The copy keeps the skill names declared in its files. Duplicate skill names are
                rejected. Replacing an individual built-in skill, such as update-models, is not
                currently supported; adding this copy does not override it.
              </p>
            </details>
          </div>
        ) : null}
        {inspection.isPending ? (
          <StateView kind="loading" size="row" title="Reading plugin…" />
        ) : null}
        {inspection.error ? (
          <StateView
            action={{ label: 'Retry', onClick: () => void inspection.refetch() }}
            kind="error"
            size="row"
            title={`Plugin details could not be loaded: ${inspection.error.message}`}
          />
        ) : null}
        {plugin ? (
          <>
            <SegmentedControl
              label="Plugin details"
              onValueChange={setTab}
              options={tabs}
              value={current}
            />
            {current === 'capabilities' ? (
              <Capabilities
                catalog={catalog.data?.plugins ?? []}
                files={files}
                onMember={open}
                onSkill={openSkill}
                plugin={plugin}
                servers={servers.data ?? []}
                skillView={Boolean(selected.skill)}
              />
            ) : null}
            {current === 'tools' ? (
              <div className="mt-3">
                {selected.pending ? (
                  <p className="text-muted-foreground">
                    Tool settings are available once this plugin is installed and trusted.
                  </p>
                ) : (
                  <PluginToolSettings reference={selected.reference} />
                )}
              </div>
            ) : null}
            {current === 'files' ? (
              <div className="mt-3 grid gap-2.5">
                {inspection.data?.incomplete ? (
                  <p className="text-xs text-muted-foreground">
                    {inspection.data.reason || 'Some source files could not be fully included.'} A
                    complete source is required to save a variation.
                  </p>
                ) : null}
                <div className="clio-scrollbar max-h-40 min-w-0 overflow-auto rounded-md border border-border">
                  <FileTree
                    aria-label="Plugin files"
                    className="border-0 bg-transparent font-sans"
                    defaultExpanded={
                      new Set(
                        files.flatMap((f) =>
                          f.path
                            .split('/')
                            .slice(0, -1)
                            .map((_, i, a) => a.slice(0, i + 1).join('/')),
                        ),
                      )
                    }
                    key={`${selected.reference}:${selected.skill}`}
                    onSelect={setPath}
                    selectedPath={file?.path}
                  >
                    <SourceNodes files={files} />
                  </FileTree>
                </div>
                <div className="flex h-[min(32rem,60dvh)] min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border">
                  {file?.error ? (
                    <p className="p-3" role="alert">
                      {file.error}
                    </p>
                  ) : file ? (
                    <Suspense
                      fallback={<StateView kind="loading" size="row" title="Loading file…" />}
                    >
                      <ScopedDocumentNavigation.Provider
                        value={{
                          current: file.path,
                          files: files.map((row) => row.path),
                          open: setPath,
                        }}
                      >
                        <FileViewerShell
                          source={{
                            kind: 'provided',
                            name: file.path,
                            mediaType: 'text/plain',
                            ...(!editing ? { size: file.bytes } : {}),
                            origin: editing ? 'Unsaved local copy' : 'Plugin source',
                            readBytes: async () =>
                              new TextEncoder().encode(
                                editing ? (changes[file.path] ?? file.text) : file.text,
                              ),
                          }}
                          tabs={[
                            {
                              value: 'preview',
                              label: file.path,
                              icon: FileIcon,
                              content: editing ? (
                                <PluginSourceEditor
                                  error={saveError}
                                  name={variation}
                                  onCancel={() => {
                                    setEditing(false);
                                    setChanges({});
                                    setSaveError('');
                                  }}
                                  onName={setVariation}
                                  onSave={() => void saveVariation()}
                                  onText={(text) => setChanges({ ...changes, [file.path]: text })}
                                  path={file.path}
                                  saving={saving}
                                  text={changes[file.path] ?? file.text}
                                />
                              ) : (
                                <FileReader
                                  content={file.text}
                                  key={`${selected.reference}/${file.path}`}
                                  name={file.path}
                                  view={file.path.endsWith('.html') ? 'source' : undefined}
                                />
                              ),
                            },
                          ]}
                        />
                      </ScopedDocumentNavigation.Provider>
                    </Suspense>
                  ) : (
                    <StateView
                      kind="empty"
                      size="row"
                      title="No readable source files were found."
                    />
                  )}
                  {file?.truncated ? (
                    <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Showing the beginning of this file ({file.bytes.toLocaleString()} bytes in
                      full).
                    </p>
                  ) : null}
                </div>
                {!editing ? (
                  <Button
                    className="w-fit"
                    disabled={!editable}
                    onClick={startEditing}
                    size="sm"
                    variant="outline"
                  >
                    Edit a local copy
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </DetailPane>
  );
}

const OTHER_PARTS: [keyof PluginEntry, string, ReactNode][] = [
  ['tools', 'Tools', <WorkflowIcon key="tools" />],
  ['subagents', 'Subagents', <BotIcon key="subagents" />],
  ['flows', 'Flows', <WorkflowIcon key="flows" />],
  ['fragments', 'Prompt fragments', <FileIcon key="fragments" />],
  ['hooks', 'Hooks', <TerminalIcon key="hooks" />],
  ['catalogs', 'UI catalogs', <LayersIcon key="catalogs" />],
];

function Capabilities({
  plugin,
  catalog,
  files,
  servers,
  skillView,
  onMember,
  onSkill,
}: {
  plugin: PluginEntry;
  catalog: readonly PluginEntry[];
  files: readonly SourceFile[];
  servers: readonly McpServerDefinition[];
  skillView: boolean;
  onMember: (plugin: PluginEntry) => void;
  onSkill: (skill: string) => void;
}) {
  const empty =
    !plugin.members.length &&
    !plugin.skills.length &&
    !plugin.mcp_servers.length &&
    !plugin.commands.length &&
    OTHER_PARTS.every(([key]) => !(plugin[key] as string[]).length);
  return (
    <div className="mt-1">
      {plugin.description ? (
        <p className="mt-3 leading-5 text-muted-foreground">{plugin.description}</p>
      ) : null}
      {plugin.members.length ? (
        <>
          <SettingsGroupLabel>Plugins in this pack</SettingsGroupLabel>
          <ItemList label="Pack members">
            {plugin.members.map((ref) => {
              const member = catalogMember(catalog, plugin, ref);
              return (
                <ExtensionRow
                  icon={<LayersIcon />}
                  key={ref}
                  meta={member ? [member.description || member.ref] : ['Not installed']}
                  name={member?.id ?? ref}
                  onExplore={member ? () => onMember(member) : undefined}
                  size="sm"
                  status={member ? pluginStatus(member) : undefined}
                />
              );
            })}
          </ItemList>
        </>
      ) : null}
      {plugin.skills.length && !skillView ? (
        <>
          <SettingsGroupLabel>Skills</SettingsGroupLabel>
          <ItemList label="Skills">
            {plugin.skills.map((skill) => (
              <ExtensionRow
                exploreLabel={`Open ${skill}`}
                icon={<SparklesIcon />}
                key={skill}
                meta={[markdownSummary(partFile(files, 'skills', skill)?.text)]}
                name={skill}
                onExplore={() => onSkill(skill)}
                size="sm"
              />
            ))}
          </ItemList>
        </>
      ) : null}
      {plugin.mcp_servers.length ? (
        <>
          <SettingsGroupLabel>MCP servers</SettingsGroupLabel>
          <ItemList label="MCP servers">
            {plugin.mcp_servers.map((name) => {
              const server = servers.find(
                (row) => row.name === name && (!row.plugin || row.plugin === plugin.ref),
              );
              const target = specTarget(server?.spec)?.short;
              return (
                <ExtensionRow
                  icon={<ServerIcon />}
                  key={name}
                  meta={target ? [{ text: target, mono: true }] : []}
                  name={name}
                  size="sm"
                  status={serviceStatus(server)}
                />
              );
            })}
          </ItemList>
        </>
      ) : null}
      {plugin.commands.length ? (
        <>
          <SettingsGroupLabel>Commands</SettingsGroupLabel>
          <ItemList label="Commands">
            {plugin.commands.map((name) => (
              <ExtensionRow
                icon={<TerminalIcon />}
                key={name}
                meta={[markdownSummary(partFile(files, 'commands', name)?.text)]}
                name={name.startsWith('/') ? name : `/${name}`}
                size="sm"
              />
            ))}
          </ItemList>
        </>
      ) : null}
      {OTHER_PARTS.map(([key, label, icon]) => {
        const names = plugin[key] as string[];
        return names.length ? (
          <div key={key}>
            <SettingsGroupLabel>{label}</SettingsGroupLabel>
            <ItemList label={label}>
              {names.map((name) => (
                <ExtensionRow icon={icon} key={name} name={name} size="sm" />
              ))}
            </ItemList>
          </div>
        ) : null;
      })}
      {plugin.requires.length ? (
        <p className="mt-3 text-muted-foreground">Requires {plugin.requires.join(', ')}</p>
      ) : null}
      {plugin.diagnostics.length ? (
        <>
          <SettingsGroupLabel>Notes</SettingsGroupLabel>
          <ul className="grid gap-1 text-xs">
            {plugin.diagnostics.map((note, index) => (
              <li
                className={note.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'}
                key={index}
              >
                {note.message}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {empty && !plugin.description ? (
        <StateView kind="empty" size="row" title="This plugin declares no capabilities." />
      ) : null}
    </div>
  );
}

/** The plugin explorer as a dialog, for places with no room beside a list. */
export function PluginExplorer(props: Omit<PluginDetailPaneProps, 'className'>) {
  return (
    <Dialog
      onOpenChange={(value) => {
        if (!value) props.onClose();
      }}
      open
    >
      <DialogContent
        className="flex h-[min(48rem,calc(100dvh-2rem))] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Plugin details</DialogTitle>
        <PluginDetailPane {...props} />
      </DialogContent>
    </Dialog>
  );
}

function SourceNodes({ files, prefix = '' }: { files: SourceFile[]; prefix?: string }) {
  const children = [
    ...new Set(files.map((f) => f.path.slice(prefix.length).split('/')[0]!)),
  ].sort();
  return (
    <>
      {children.map((name) => {
        const path = prefix + name;
        const folder = files.some((f) => f.path.startsWith(path + '/'));
        return folder ? (
          <FileTreeFolder key={path} name={name} path={path}>
            <SourceNodes
              files={files.filter((f) => f.path.startsWith(path + '/'))}
              prefix={path + '/'}
            />
          </FileTreeFolder>
        ) : (
          <FileTreeFile key={path} name={name} path={path} title={path} />
        );
      })}
    </>
  );
}
