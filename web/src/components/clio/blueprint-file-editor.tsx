import { queryKeys } from '@/lib/query-keys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/mode-markdown';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-sh';
import 'ace-builds/src-noconflict/mode-text';
import 'ace-builds/src-noconflict/mode-toml';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-one_dark';
import { FileCode2Icon } from 'lucide-react';
import { SaveIcon } from '@/lib/icon-vocabulary';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';

/** Edits one server-owned blueprint source file with a real code editor and explicit save. */
export function BlueprintFileEditor({
  blueprintId,
  workspaceId,
  sessionId,
  path,
}: {
  blueprintId: string;
  workspaceId: string;
  sessionId: string;
  path: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const queryKey = ['blueprint-file', blueprintId, workspaceId, sessionId, path] as const;
  const content = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      repository.readAgentBlueprintFile(blueprintId, path, { workspaceId, sessionId }, signal),
  });
  const [draft, setDraft] = useState('');
  const [baseline, setBaseline] = useState('');
  const [loadedPath, setLoadedPath] = useState('');
  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });
  const activeDraft = loadedPath === path ? draft : (content.data ?? '');
  const activeBaseline = loadedPath === path ? baseline : (content.data ?? '');
  const dirty = activeDraft !== activeBaseline;
  const updateDraft = (next: string) => {
    if (loadedPath !== path) {
      setLoadedPath(path);
      setBaseline(content.data ?? '');
    }
    setDraft(next);
  };

  const save = useMutation({
    mutationFn: (next: string) =>
      repository.writeAgentBlueprintFile(blueprintId, path, next, { workspaceId, sessionId }),
    onSuccess: async (result, next) => {
      queryClient.setQueryData(queryKey, next);
      setBaseline(next);
      setValidation({
        errors: result.validation_errors,
        warnings: result.validation_warnings,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key(
            'blueprint-files',
            settings.endpoint,
            blueprintId,
            workspaceId,
            sessionId,
          ),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.key('agent-blueprints') }),
      ]);
      toast.success(`Saved ${fileName(path)}`);
    },
    onError: (error) => toast.error(error.message),
  });

  if (content.error) {
    return (
      <div className="p-4" role="alert">
        <p className="font-medium text-destructive">Blueprint source unavailable</p>
        <p className="text-sm text-muted-foreground">{content.error.message}</p>
      </div>
    );
  }
  if (content.data === undefined) {
    return (
      <div className="space-y-2 p-4" role="status">
        <span className="sr-only">Loading {fileName(path)}</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <section aria-label={`Edit ${path}`} className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <FileCode2Icon aria-hidden="true" className="size-4 text-primary" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
        {dirty ? (
          <Badge variant="secondary">Unsaved</Badge>
        ) : (
          <Badge variant="outline">Saved</Badge>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <AceEditor
          aria-label={`Blueprint source ${path}`}
          editorProps={{ $blockScrolling: true }}
          fontSize={13}
          height="100%"
          mode={aceModeForPath(path)}
          name={`blueprint-editor-${blueprintId}-${path}`}
          onChange={updateDraft}
          setOptions={{
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: false,
            highlightActiveLine: true,
            showFoldWidgets: true,
            showPrintMargin: false,
            tabSize: 2,
            useSoftTabs: true,
            useWorker: false,
          }}
          theme={resolvedTheme === 'light' ? 'github' : 'one_dark'}
          value={activeDraft}
          width="100%"
        />
      </div>
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-t px-3 py-2">
        <div aria-live="polite" className="min-w-0 flex-1 text-xs">
          {save.error ? <p className="text-destructive">{save.error.message}</p> : null}
          {validation.errors.length ? (
            <p className="truncate text-destructive">
              Saved with {validation.errors.length} validation issue
              {validation.errors.length === 1 ? '' : 's'}
            </p>
          ) : validation.warnings.length ? (
            <p className="truncate text-amber-500">
              Saved with {validation.warnings.length} warning
              {validation.warnings.length === 1 ? '' : 's'}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {dirty
                ? 'Review the source, then save it to the connected service.'
                : 'Source is saved.'}
            </p>
          )}
        </div>
        <Button
          className="h-10 min-w-28 px-5"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(activeDraft)}
        >
          <SaveIcon aria-hidden="true" />
          {save.isPending ? 'Saving' : 'Save'}
        </Button>
      </div>
    </section>
  );
}

function fileName(path: string): string {
  return path.replace(/\\/gu, '/').split('/').pop() || path;
}

function aceModeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (extension === 'json') return 'json';
  if (extension === 'py') return 'python';
  if (extension === 'sh' || extension === 'bash') return 'sh';
  if (extension === 'toml') return 'toml';
  if (extension === 'yaml' || extension === 'yml') return 'yaml';
  return 'text';
}
