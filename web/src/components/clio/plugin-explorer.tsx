import type { PluginEntry, PluginInspection } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { lazy, Suspense, useState } from 'react';
import { FileTree, FileTreeFile, FileTreeFolder } from '@/components/ai-elements/file-tree';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { queryKeys } from '@/lib/query-keys';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { usePluginCatalog, useExtensionsSupported } from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import { catalogMember } from '@/lib/plugin-catalog-tree';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ScopedDocumentNavigation } from './scoped-document-navigation';
import { FileViewerShell } from './file-viewer-shell';
import { FileIcon } from 'lucide-react';

const FileReader = lazy(async () => ({ default: (await import('./file-text-view')).FileTextView }));
type SourceFile = PluginInspection['files'][number];

/** One inspector for installed entries and plugins reached through an agent. */
export function PluginExplorer({
  reference,
  pending = false,
  initialSkill,
  onClose,
}: {
  reference: string;
  pending?: boolean;
  initialSkill?: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<{ reference: string; pending: boolean; skill?: string }>(
    { reference, pending, skill: initialSkill },
  );
  const [tab, setTab] = useState(initialSkill ? 'files' : 'capabilities');
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
  const plugin = inspection.data?.plugin;
  const [path, setPath] = useState('');
  const [editing, setEditing] = useState(false);
  const [variation, setVariation] = useState('');
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [trusting, setTrusting] = useState(false);
  const [trustError, setTrustError] = useState('');
  const files = inspection.data?.files ?? [];
  const file =
    files.find((f) => f.path === path) ??
    files.find((f) => /(?:README|SKILL)\.md$/iu.test(f.path)) ??
    files[0];
  const open = (entry: PluginEntry) => {
    setEditing(false);
    setChanges({});
    setSaveError('');
    setSelected({ reference: entry.ref, pending: entry.pending_trust });
    setPath('');
    setTab('capabilities');
  };
  async function trustSource() {
    if (!plugin) return;
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
      toast.success('Saved a local variation', {
        description:
          'Your original source is unchanged. Trust the new source in Extensions to use it.',
      });
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Could not save variation');
    } finally {
      setSaving(false);
    }
  }
  const parts: [keyof PluginEntry, string][] = [
    ['tools', 'Tools'],
    ['skills', 'Skills'],
    ['flows', 'Flows'],
    ['subagents', 'Subagents'],
    ['fragments', 'Prompt fragments'],
    ['mcp_servers', 'MCP servers'],
    ['commands', 'Commands'],
    ['hooks', 'Hooks'],
    ['catalogs', 'UI catalogs'],
  ];
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="flex h-[min(48rem,calc(100dvh-2rem))] min-w-0 flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{selected.skill || plugin?.id || selected.reference}</DialogTitle>
          <DialogDescription>
            {plugin
              ? `${plugin.marketplace}${plugin.version ? `, version ${plugin.version}` : ''}`
              : 'Plugin details'}
          </DialogDescription>
        </DialogHeader>
        {plugin ? (
          <div className="flex flex-wrap items-center gap-2">
            {selected.skill ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelected({ ...selected, skill: undefined });
                  setEditing(false);
                  setChanges({});
                  setPath('');
                  setTab('capabilities');
                }}
              >
                Back to plugin
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={
                supported !== true ||
                inspection.data?.incomplete ||
                files.some((row) => row.truncated || row.error)
              }
              onClick={() => {
                setEditing(!editing);
                setVariation(`${selected.skill || plugin.id}-local`);
                setTab('files');
              }}
            >
              {' '}
              {editing ? 'Cancel editing' : 'Edit a local variation'}
            </Button>
            {inspection.data?.incomplete ? (
              <span className="text-xs text-muted-foreground">
                A complete source is required to save a variation.
              </span>
            ) : null}
          </div>
        ) : null}
        {inspection.isPending ? <p role="status">Reading plugin…</p> : null}
        {inspection.error ? (
          <div role="alert" className="grid gap-2 text-sm">
            <p>Plugin details could not be loaded: {inspection.error.message}</p>
            <Button className="w-fit" variant="outline" onClick={() => void inspection.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
        {plugin ? (
          <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-3">
            <TabsList>
              <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
              <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
            </TabsList>
            <TabsContent
              value="capabilities"
              className="clio-scrollbar min-h-0 flex-1 overflow-y-auto"
            >
              <div className="grid gap-4 text-sm leading-6">
                {plugin.description ? <p>{plugin.description}</p> : null}
                {!plugin.trusted ? (
                  <div className="grid gap-2 rounded-md border p-3">
                    <p className="text-muted-foreground">
                      Not trusted. Trusting this source allows its plugins to load code on this
                      agent host.
                    </p>
                    <Button
                      className="w-fit"
                      size="sm"
                      disabled={trusting}
                      onClick={() => void trustSource()}
                    >
                      {trusting ? 'Trusting…' : `Trust source: ${plugin.marketplace}`}
                    </Button>
                    {trustError ? (
                      <p role="alert" className="text-destructive">
                        {trustError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {plugin.members.length ? (
                  <section aria-label="Pack members" className="grid gap-1">
                    <h3 className="font-medium">Plugins in this pack</h3>
                    {plugin.members.map((ref) => {
                      const member = catalogMember(catalog.data?.plugins ?? [], plugin, ref);
                      return (
                        <Button
                          key={ref}
                          className="h-auto justify-start py-2 text-left"
                          variant="ghost"
                          disabled={!member}
                          onClick={() => member && open(member)}
                        >
                          {ref}
                          {member ? '' : ' (not installed)'}
                        </Button>
                      );
                    })}
                  </section>
                ) : null}
                {parts.map(([key, label]) => {
                  const names = plugin[key] as string[];
                  return names.length ? (
                    <details key={key} className="border-b pb-2">
                      <summary className="cursor-pointer font-medium">
                        {label} ({names.length})
                      </summary>
                      <ul className="mt-2 grid gap-1 pl-4">
                        {names.map((name) => (
                          <li className="break-words" key={name}>
                            {key === 'skills' ? (
                              <Button
                                className="h-auto justify-start px-0 text-left"
                                variant="link"
                                onClick={() => {
                                  setSelected({ ...selected, skill: name });
                                  setPath('');
                                  setEditing(false);
                                  setChanges({});
                                  setTab('files');
                                }}
                              >
                                {name}
                              </Button>
                            ) : (
                              name
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null;
                })}
                {plugin.requires.length ? (
                  <p className="text-muted-foreground">Requires {plugin.requires.join(', ')}</p>
                ) : null}
                {plugin.diagnostics.map((note, i) => (
                  <p
                    key={i}
                    className={
                      note.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'
                    }
                  >
                    {note.message}
                  </p>
                ))}
              </div>
            </TabsContent>
            <TabsContent
              value="files"
              className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]"
            >
              <div className="clio-scrollbar max-h-44 min-w-0 overflow-auto md:max-h-none">
                <FileTree
                  key={`${selected.reference}:${selected.skill}`}
                  aria-label="Plugin files"
                  className="border-0 bg-transparent font-sans"
                  selectedPath={file?.path}
                  onSelect={setPath}
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
                >
                  <SourceNodes files={files} />
                </FileTree>
              </div>
              <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border">
                {inspection.data?.incomplete ? (
                  <p className="shrink-0 border-b px-3 py-2 text-sm text-muted-foreground">
                    {inspection.data.reason || 'Some source files could not be fully included.'}
                  </p>
                ) : null}
                {file?.error ? (
                  <p role="alert" className="p-3 text-sm">
                    {file.error}
                  </p>
                ) : file ? (
                  <Suspense
                    fallback={
                      <p role="status" className="p-3">
                        Loading file…
                      </p>
                    }
                  >
                    {editing ? (
                      <div className="grid gap-3">
                        <Label className="grid gap-2">
                          New variation name
                          <Input
                            value={variation}
                            onChange={(event) => setVariation(event.target.value)}
                          />
                        </Label>
                        <Label className="grid gap-2">
                          {file.path}
                          <Textarea
                            className="min-h-72 font-mono text-sm"
                            value={changes[file.path] ?? file.text}
                            onChange={(event) =>
                              setChanges({ ...changes, [file.path]: event.target.value })
                            }
                          />
                        </Label>
                        {saveError ? (
                          <p role="alert" className="text-destructive">
                            {saveError}
                          </p>
                        ) : null}
                        <Button
                          disabled={saving || !variation.trim()}
                          className="w-fit"
                          onClick={() => void saveVariation()}
                        >
                          {saving ? 'Saving…' : 'Save as new variation'}
                        </Button>
                      </div>
                    ) : (
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
                            size: file.bytes,
                            origin: 'Plugin source',
                            readBytes: async () => new TextEncoder().encode(file.text),
                          }}
                          tabs={[
                            {
                              value: 'preview',
                              label: file.path,
                              icon: FileIcon,
                              content: (
                                <FileReader
                                  key={`${selected.reference}/${file.path}`}
                                  name={file.path}
                                  content={file.text}
                                  view={file.path.endsWith('.html') ? 'source' : undefined}
                                />
                              ),
                            },
                          ]}
                        />
                      </ScopedDocumentNavigation.Provider>
                    )}
                  </Suspense>
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">
                    No readable source files were found.
                  </p>
                )}
                {file?.truncated ? (
                  <p className="shrink-0 border-t px-3 py-2 text-sm text-muted-foreground">
                    Showing the beginning of this file ({file.bytes.toLocaleString()} bytes in
                    full).
                  </p>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        ) : null}
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
          <FileTreeFile key={path} path={path} name={name} title={path} />
        );
      })}
    </>
  );
}
