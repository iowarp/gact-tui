import type { PluginEntry, PluginInspection } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { FileTree, FileTreeFile, FileTreeFolder } from '@/components/ai-elements/file-tree';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { usePluginCatalog } from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import { catalogMember } from '@/lib/plugin-catalog-tree';
import { useConnectionSettings } from '@/providers/connection-provider';

const FileReader = lazy(async () => ({ default: (await import('./file-text-view')).FileTextView }));
type SourceFile = PluginInspection['files'][number];

/** One inspector for installed entries and plugins reached through an agent. */
export function PluginExplorer({
  reference,
  pending = false,
  onClose,
}: {
  reference: string;
  pending?: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState({ reference, pending });
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const catalog = usePluginCatalog();
  const inspection = useQuery({
    queryKey: [
      'plugin-inspection',
      connectionScope(settings),
      selected.reference,
      selected.pending,
    ],
    queryFn: ({ signal }) => repository.inspectPlugin(selected.reference, selected.pending, signal),
  });
  const plugin = inspection.data?.plugin;
  const [path, setPath] = useState('');
  const files = inspection.data?.files ?? [];
  const file =
    files.find((f) => f.path === path) ??
    files.find((f) => /(?:README|SKILL)\.md$/iu.test(f.path)) ??
    files[0];
  const open = (entry: PluginEntry) => {
    setSelected({ reference: entry.ref, pending: entry.pending_trust });
    setPath('');
  };
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
          <DialogTitle>{plugin?.id ?? selected.reference}</DialogTitle>
          <DialogDescription>
            {plugin
              ? `${plugin.marketplace}${plugin.version ? ` · ${plugin.version}` : ''}`
              : 'Plugin details'}
          </DialogDescription>
        </DialogHeader>
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
          <Tabs defaultValue="capabilities" className="min-h-0 flex-1 gap-3">
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
                  <p className="text-muted-foreground">
                    Not trusted · executable contributions aren’t loaded.
                  </p>
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
                          {member ? '' : ' · not installed'}
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
                            {name}
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
                  key={selected.reference}
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
                    <FileReader
                      key={`${selected.reference}/${file.path}`}
                      name={file.path}
                      content={file.text}
                      view={file.path.endsWith('.html') ? 'source' : undefined}
                    />
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
