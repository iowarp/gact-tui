import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CodeIcon, EyeIcon, GitBranchIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { FileModeControls, type FileMode } from './file-mode-controls';
import { KnowledgeGraph } from './knowledge-graph';
import { KnowledgeNoteRead, KnowledgeNoteSource } from './knowledge-note-body';
import { KnowledgeVaultTake } from './knowledge-vault-actions';
import { KnowledgeVaultFiles } from './knowledge-vault-files';
import { knowledgeDegrees } from './knowledge-vault-stats';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { StateView } from './primitives/state-view';
import { WorkbenchTabList, WorkbenchTabListToggle } from './workbench-tab-list';
import { useWorkbenchTabListPicked } from './workbench-tab-list-context';
import { t, ph, plural } from '@lingui/core/macro';

type VaultMode = 'note' | 'markdown' | 'graph';

const MODES: readonly FileMode[] = [
  { value: 'note', label: t`Note`, title: t`The selected note`, icon: EyeIcon },
  {
    value: 'markdown',
    label: t`Markdown`,
    title: t`The note’s Markdown`,
    icon: CodeIcon,
    shortcut: 'render-source',
  },
  { value: 'graph', label: t`Note graph`, title: t`How the notes link`, icon: GitBranchIcon },
];

const BODY = 'm-0 min-h-0 min-w-0 flex-1 overflow-hidden';

function accessWords(access: string | undefined) {
  return access === 'publish_later'
    ? t`Edits require review`
    : access === 'write_through'
      ? t`Edits update originals`
      : t`Read only`;
}

/**
 * A knowledge vault as a workbench tab: Note renders the selected note,
 * Markdown shows its source and Note graph how the notes link. The vault's
 * files list beside the tabs; graph, list and note share one selection.
 */
export function KnowledgeSourceView({
  workspaceId,
  sourceId,
}: {
  workspaceId: string;
  sourceId: string;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const region = useRef<HTMLDivElement>(null);
  const picked = useWorkbenchTabListPicked();
  const [mode, setMode] = useState<VaultMode>('graph');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [focus, setFocus] = useState('');
  const [selected, setSelected] = useState('');
  const [attachments, setAttachments] = useState(false);
  const key = useMemo(
    () => ['knowledge', scope, workspaceId, sourceId] as const,
    [scope, workspaceId, sourceId],
  );
  const sources = useQuery({
    queryKey: [...key, 'sources'],
    queryFn: ({ signal }) => repository.connectedSources(workspaceId, signal),
  });
  const source = sources.data?.find((row) => row.id === sourceId);
  const headless = source?.connection === 'headless_sync';
  const graph = useQuery({
    queryKey: [...key, 'graph', search, focus, attachments],
    queryFn: ({ signal }) =>
      repository.knowledgeGraph(
        workspaceId,
        sourceId,
        { query: search, focus, attachments },
        signal,
      ),
    refetchInterval: headless ? 5000 : false,
  });
  const note = useQuery({
    queryKey: [...key, 'note', selected, graph.data?.revision],
    queryFn: ({ signal }) => repository.knowledgeOpen(workspaceId, sourceId, selected, '', signal),
    enabled: Boolean(selected) && graph.isSuccess,
  });
  const sync = useQuery({
    queryKey: [...key, 'sync'],
    queryFn: () => repository.knowledgeSync(workspaceId, sourceId),
    enabled: headless,
    refetchInterval: headless ? 5000 : false,
  });
  const controlSync = useMutation({
    mutationFn: (action: 'start' | 'stop') =>
      repository.knowledgeSync(workspaceId, sourceId, action),
    onSuccess: () => void sync.refetch(),
  });
  const stats = useMemo(
    () => (graph.data ? knowledgeDegrees(graph.data) : undefined),
    [graph.data],
  );
  const opened = selected && note.data?.note.path === selected ? note.data : undefined;
  const vaultName = source?.label ?? t`Vault`;
  const noteTitle =
    opened?.note.title ??
    graph.data?.notes.find((row) => row.path === selected)?.title ??
    selected.split('/').at(-1);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  const focusOn = (path: string) => {
    setFocus(path);
    setQuery('');
    setSearch('');
  };
  const pick = (path: string) => {
    setSelected(path);
    if (mode === 'graph') setMode('note');
    picked();
  };
  const warnings = graph.data?.warnings ?? [];
  const syncError = controlSync.error?.message ?? sync.data?.error ?? undefined;
  const what = (
    <>
      {graph.data ? (
        <>
          <span
            className="tabular-nums"
            data-frame-position=""
            title={accessWords(source?.link_access)}
          >
            {attachments
              ? plural(graph.data.total, { one: '# item', other: '# items' })
              : plural(graph.data.total, { one: '# note', other: '# notes' })}
          </span>
          <span className="tabular-nums">
            {graph.data.relationships_truncated
              ? t`${ph({ count: stats?.links ?? 0 })}+ links`
              : plural(stats?.links ?? 0, { one: '# link', other: '# links' })}
          </span>
        </>
      ) : null}
      {focus ? <span>{t`Linked to ${ph({ note: focus.split('/').at(-1) ?? focus })}`}</span> : null}
      {headless ? (
        <span title={syncError}>
          {sync.data?.state === 'running'
            ? t`Sync running`
            : sync.data?.state === 'failed'
              ? t`Sync failed`
              : sync.data
                ? t`Sync stopped`
                : t`Checking sync`}
        </span>
      ) : null}
      {warnings.length ? (
        <span title={warnings.join('\n')}>
          {plural(warnings.length, { one: '# indexing warning', other: '# indexing warnings' })}
        </span>
      ) : null}
      {sources.error ? (
        <span role="alert" className="text-destructive" title={sources.error.message}>
          {sources.error.message}
        </span>
      ) : null}
    </>
  );
  const emptyVault = graph.data?.total === 0 && !search && !focus;
  const vaultState = graph.error ? (
    <StateView
      kind="error"
      size="viewer"
      title={t`The vault could not be read`}
      detail={graph.error.message}
      action={{ label: t`Retry`, onClick: refresh }}
    />
  ) : graph.isPending ? (
    <StateView kind="loading" size="viewer" title={t`Indexing vault notes`} />
  ) : emptyVault ? (
    <StateView
      kind="empty"
      size="viewer"
      title={t`Your vault is ready`}
      detail={
        source?.capabilities?.note_write && source.link_access !== 'read_only'
          ? t`There are no notes yet. Ask ${ph({ agent: vocab.agent })} to create notes in this vault, or add Markdown files to the folder and choose Refresh.`
          : t`There are no notes yet. Add Markdown files to the folder and choose Refresh. This connection is read only.`
      }
    />
  ) : null;
  const noteState = !selected ? (
    <StateView
      kind="empty"
      size="viewer"
      title={t`No note selected`}
      detail={t`Choose one in the vault list or the note graph.`}
    />
  ) : note.error ? (
    <StateView
      kind="error"
      size="viewer"
      title={t`The note could not be opened`}
      detail={note.error.message}
      action={{ label: t`Retry`, onClick: () => void note.refetch() }}
    />
  ) : !opened ? (
    <StateView kind="loading" size="viewer" title={t`Opening the note`} />
  ) : null;
  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={region}
        aria-label={t`Knowledge source`}
        data-slot="knowledge-vault"
        className="flex h-full min-h-0 min-w-0 flex-col"
      >
        <Tabs
          value={mode}
          onValueChange={(next) => setMode(next as VaultMode)}
          className="flex h-full min-h-0 min-w-0 flex-col gap-0"
        >
          <FrameBar
            label={t`Vault actions`}
            where={
              <FrameCrumbs
                parts={
                  selected && mode !== 'graph'
                    ? [
                        { label: vaultName, onSelect: () => setSelected('') },
                        { label: noteTitle || selected },
                      ]
                    : [{ label: t`vault` }, { label: vaultName }]
                }
              />
            }
            what={what}
            format={
              <>
                <FileModeControls
                  modes={MODES}
                  value={mode}
                  onChange={(next) => setMode(next as VaultMode)}
                  label={t`Vault views`}
                />
                <WorkbenchTabListToggle />
              </>
            }
            actions={
              <KnowledgeVaultTake
                source={source}
                workspaceId={workspaceId}
                selected={selected}
                opened={opened}
                region={region}
                menu={{
                  mode,
                  selected,
                  focus,
                  setFocus: focusOn,
                  attachments,
                  setAttachments,
                  refresh,
                  sync: headless
                    ? {
                        running: sync.data?.state === 'running',
                        pending: controlSync.isPending,
                        toggle: () =>
                          controlSync.mutate(sync.data?.state === 'running' ? 'stop' : 'start'),
                      }
                    : undefined,
                }}
              />
            }
          />
          <WorkbenchTabList title={t`Vault`}>
            <KnowledgeVaultFiles
              queryKey={key}
              workspaceId={workspaceId}
              sourceId={sourceId}
              query={query}
              onQuery={setQuery}
              search={search}
              focus={focus}
              selected={selected}
              onPick={pick}
              refetchInterval={headless ? 5000 : false}
            />
          </WorkbenchTabList>
          {vaultState ? (
            <div className={BODY}>{vaultState}</div>
          ) : (
            <>
              <TabsContent value="note" className={BODY}>
                {noteState ??
                  (opened ? (
                    <KnowledgeNoteRead
                      opened={opened}
                      workspaceId={workspaceId}
                      onSelect={setSelected}
                      notes={graph.data?.notes}
                    />
                  ) : null)}
              </TabsContent>
              <TabsContent value="markdown" className={BODY}>
                {noteState ??
                  (opened?.note.kind === 'attachment' ? (
                    <StateView
                      kind="no-preview"
                      size="viewer"
                      title={t`An attachment has no Markdown`}
                      detail={t`Choose Note to see it.`}
                    />
                  ) : opened ? (
                    <KnowledgeNoteSource opened={opened} />
                  ) : null)}
              </TabsContent>
              <TabsContent value="graph" className={BODY}>
                {graph.data ? (
                  <KnowledgeGraph
                    snapshot={graph.data}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ) : null}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
