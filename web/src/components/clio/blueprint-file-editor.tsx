import { queryKeys } from '@/lib/query-keys';
import {
  skipToken,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
import { InfoTip } from './info-tip';
import { vocab } from '@/lib/brand-vocabulary';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { connectionScope } from '@/lib/connection-scope';
import { BlueprintOperationStatus } from './blueprint-operation-status';
import { useBlueprintOperation } from '@/hooks/use-blueprint-operation';

type BlueprintFileEditorProps = {
  blueprintId: string;
  workspaceId: string;
  sessionId: string;
  path: string;
};

/** Edits one server-owned blueprint source file with a real code editor and explicit save. */
export function BlueprintFileEditor(props: BlueprintFileEditorProps) {
  const { settings } = useConnectionSettings();
  return <BlueprintFileEditorView key={connectionScope(settings)} {...props} />;
}

function BlueprintFileEditorView({
  blueprintId,
  workspaceId,
  sessionId,
  path,
}: BlueprintFileEditorProps) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const owner = connectionScope(settings);
  const operation = useBlueprintOperation({ blueprintId, workspaceId });
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const queryKey = [
    'blueprint-file',
    settings.endpoint,
    owner,
    blueprintId,
    workspaceId,
    sessionId,
    path,
  ] as const;
  const content = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      repository.readAgentBlueprintDraft(blueprintId, path, { workspaceId, sessionId }, signal),
    refetchInterval: 5000,
  });
  const authoringKey = [
    'blueprint-authoring',
    settings.endpoint,
    owner,
    blueprintId,
    workspaceId,
    sessionId,
  ];
  const authoring = useQuery({
    queryKey: authoringKey,
    queryFn: ({ signal }) =>
      repository.agentBlueprintAuthoring(blueprintId, { workspaceId, sessionId }, signal),
    refetchInterval: 5000,
  });
  type Buffer = { text: string; baseline: string; hash: string };
  const bufferKey = [
    'blueprint-editor-buffer',
    settings.endpoint,
    owner,
    blueprintId,
    workspaceId,
    path,
  ];
  const buffer = useQuery<Buffer | null>({
    queryKey: bufferKey,
    queryFn: skipToken,
    initialData: null,
    enabled: false,
    gcTime: Infinity,
  });
  const [checkout, setCheckout] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [commitChanges, setCommitChanges] = useState(false);
  const [pushCommit, setPushCommit] = useState(false);
  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });
  const hasEdits = buffer.data && buffer.data.text !== buffer.data.baseline;
  const activeDraft = hasEdits ? buffer.data!.text : (content.data?.content ?? '');
  const activeBaseline = hasEdits ? buffer.data!.baseline : (content.data?.content ?? '');
  const dirty = activeDraft !== activeBaseline;
  const conflict = Boolean(
    dirty && content.data && buffer.data?.hash !== content.data.content_hash,
  );
  const updateDraft = (next: string) => {
    queryClient.setQueryData<Buffer>(bufferKey, {
      text: next,
      baseline: activeBaseline,
      hash: hasEdits ? buffer.data!.hash : (content.data?.content_hash ?? ''),
    });
  };

  const save = useMutation({
    mutationFn: (next: string) =>
      repository.writeAgentBlueprintFile(blueprintId, path, next, {
        workspaceId,
        sessionId,
        expectedHash: hasEdits ? buffer.data!.hash : content.data?.content_hash,
      }),
    onSuccess: async (result, next) => {
      queryClient.setQueryData(queryKey, { content: next, content_hash: result.content_hash });
      queryClient.setQueryData<Buffer | null>(bufferKey, (current) =>
        current && current.text !== next
          ? { ...current, baseline: next, hash: result.content_hash ?? '' }
          : null,
      );
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
        queryClient.invalidateQueries({ queryKey: queryKeys.agentBlueprints(settings.endpoint) }),
        queryClient.invalidateQueries({ queryKey: authoringKey }),
      ]);
      toast.success(`Draft saved: ${fileName(path)}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const publish = useMutation({
    mutationFn: () =>
      repository.publishAgentBlueprintDraft(blueprintId, {
        workspaceId,
        sessionId,
        checkout,
        commitMessage: commitChanges ? commitMessage : '',
        push: commitChanges && pushCommit,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authoringKey });
      toast.success(
        authoring.data?.separate_checkout
          ? 'Working checkout published. Update the marketplace source before Reload.'
          : 'Source published. Reload to apply it.',
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const reload = useMutation({
    mutationKey: ['blueprint-reload', settings.endpoint, owner, blueprintId, workspaceId],
    mutationFn: () =>
      repository.updateAgentBlueprint(blueprintId, {
        scope: authoring.data?.scope === 'global' ? 'global' : 'workspace',
        workspace_id: workspaceId,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: authoringKey }),
        queryClient.invalidateQueries({ queryKey: ['blueprint-file', settings.endpoint] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agentBlueprints(settings.endpoint) }),
      ]);
      toast.success('Blueprint revision applied.');
    },
    onError: (error) => toast.error(error.message),
  });
  const reloading =
    useIsMutating({
      mutationKey: ['blueprint-reload', settings.endpoint, owner, blueprintId, workspaceId],
    }) > 0 || operation.pending;
  const busy = save.isPending || publish.isPending || reloading;
  const unpublished = Boolean(authoring.data?.unpublished_files.length);

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
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b px-3 py-2">
        <FileCode2Icon aria-hidden="true" className="size-4 text-primary" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
        {dirty ? (
          <Badge variant="secondary">Unsaved</Badge>
        ) : (
          <Badge variant="outline">
            {unpublished
              ? 'Draft saved'
              : authoring.data?.reload_required
                ? authoring.data.separate_checkout
                  ? 'Checkout differs'
                  : 'Ready to reload'
                : 'Applied'}
          </Badge>
        )}
        <InfoTip label="About blueprint authoring">
          Save draft keeps edits separate from the running blueprint. Publish validates and writes
          the authoring source. Reload waits for running turns to finish. Paths belong to the
          connected {vocab.agent}. Reload reads the registered marketplace source:{' '}
          {authoring.data?.reload_source ?? authoring.data?.source}.
          {authoring.data?.separate_checkout
            ? ' This editor uses a separate working checkout. Publish upstream to the selected Git ref, or select this folder as the marketplace source, before Reload can include these edits.'
            : ''}
        </InfoTip>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={authoring.data?.source}>
          {authoring.data?.source || 'Loading source…'}
        </span>
        <span className="shrink-0">{authoring.data?.installed_revision.slice(0, 8)}</span>
        <InfoTip label="About source host">Connected service: {settings.endpoint}</InfoTip>
      </div>
      {conflict ? (
        <div className="shrink-0 border-b p-3 text-xs" role="alert">
          <p className="text-amber-600">
            Another editor changed this file. Your edits are retained.
          </p>
          <details className="mt-2">
            <summary>Review saved version</summary>
            <pre className="my-2 max-h-40 overflow-auto whitespace-pre-wrap">
              {content.data.content}
            </pre>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => queryClient.setQueryData(bufferKey, null)}
              >
                Use saved version
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  queryClient.setQueryData(bufferKey, {
                    text: activeDraft,
                    baseline: content.data.content,
                    hash: content.data.content_hash,
                  })
                }
              >
                Keep my edits
              </Button>
            </div>
          </details>
        </div>
      ) : null}
      {operation.operation ? (
        <div className="shrink-0 border-b px-3 py-2">
          <BlueprintOperationStatus operation={operation.operation} />
        </div>
      ) : null}
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
      {authoring.data?.git_source ? (
        <details className="shrink-0 border-t px-3 py-2 text-xs">
          <summary>Git publishing options</summary>
          {authoring.data.checkout_required ? (
            <Input
              aria-label={`Working checkout on connected ${vocab.agent}`}
              className="mt-2 w-full rounded-md border bg-background p-2"
              placeholder={`Path on connected ${vocab.agent}`}
              value={checkout}
              onChange={(event) => setCheckout(event.target.value)}
            />
          ) : null}
          <label className="mt-3 flex items-center gap-2">
            <Checkbox
              checked={commitChanges}
              onCheckedChange={(checked) => setCommitChanges(checked === true)}
            />
            Commit these blueprint changes
          </label>
          {commitChanges ? (
            <div className="mt-2 space-y-2">
              <Input
                aria-label="Commit message"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="Commit message"
              />
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={pushCommit}
                  onCheckedChange={(checked) => setPushCommit(checked === true)}
                />
                Push to the configured upstream
              </label>
            </div>
          ) : null}
        </details>
      ) : null}
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-t px-3 py-2">
        <div aria-live="polite" className="w-full text-xs">
          {save.error ? <p className="text-destructive">{save.error.message}</p> : null}
          {publish.error ? <p className="text-destructive">{publish.error.message}</p> : null}
          {reload.error ? <p className="text-destructive">{reload.error.message}</p> : null}
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
              {reloading
                ? 'Waiting for turns and applying source…'
                : dirty
                  ? 'Unsaved edits retained in this window.'
                  : unpublished
                    ? 'Draft saved; runtime unchanged.'
                    : authoring.data?.reload_required
                      ? authoring.data.separate_checkout
                        ? 'Publish upstream to include checkout edits.'
                        : 'Source differs; Reload to apply.'
                      : 'Applied revision.'}
            </p>
          )}
        </div>
        <Button
          className="h-10 px-3"
          variant="outline"
          disabled={!dirty || busy || conflict}
          onClick={() => save.mutate(activeDraft)}
        >
          <SaveIcon aria-hidden="true" />
          {save.isPending ? 'Saving' : 'Save draft'}
        </Button>
        <Button
          className="h-10 px-3"
          variant="outline"
          disabled={
            dirty ||
            busy ||
            (!unpublished && !publish.error) ||
            (authoring.data?.checkout_required && !checkout.trim()) ||
            (commitChanges && !commitMessage.trim())
          }
          onClick={() => publish.mutate()}
        >
          {publish.isPending ? 'Publishing' : 'Publish'}
        </Button>
        <Button
          className="h-10 px-3"
          disabled={busy || !authoring.data}
          onClick={() => reload.mutate()}
        >
          {reloading ? 'Reloading' : 'Reload'}
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
