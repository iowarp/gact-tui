import { vocab } from '@/lib/brand-vocabulary';
import type { Session } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, ChevronDownIcon, SendIcon, SparklesIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { useLiveSessionTranscript } from '@/hooks/use-live-session-transcript';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { isSessionActive } from '@/lib/session-state';
import type { ClioModelOption } from '@/lib/model-options';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { ClioModelPicker } from './model-picker';
import type { ClioWorkbenchOpenRequest } from './workbench';
import { ClioConversation } from './conversation';

/** An isolated real CLIO session: Tab selects the mode; Enter starts inference. */
export function ClioSearchAssistant({
  workspaceId,
  parentSessionId,
  query,
  onQueryChange,
  onBack,
  onClose,
  onOpenResource,
}: {
  workspaceId: string;
  parentSessionId?: string;
  query: string;
  onQueryChange: (query: string) => void;
  onBack: () => void;
  onClose: () => void;
  onOpenResource?: (request: ClioWorkbenchOpenRequest) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [session, setSession] = useState<Session>();
  const [model, setModel] = useState<ClioModelOption>();
  const { options, catalog } = useProviderGroups();
  const held = useRef<Session | undefined>(undefined);
  const alive = useRef(true);
  const sending = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const { entities, messages, transcript } = useLiveSessionTranscript(
    session?.workspace_id ?? workspaceId,
    session?.id,
    'search',
  );
  const fleet = useQuery({
    queryKey: ['fleet-settings', settings.endpoint, connectionScope(settings)],
    queryFn: ({ signal }) => repository.fleetSettings(signal),
  });
  const active = Boolean(
    session && isSessionActive(entities.sessions[session.id]?.state ?? session.state),
  );
  const unavailable = Boolean(fleet.data && fleet.data.search === undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const previous = held.current;
      held.current = undefined;
      if (previous)
        void repository.deleteSession(previous.id).catch((reason: unknown) =>
          toast.error(`${vocab.agent} Search could not be closed`, {
            description: reason instanceof Error ? reason.message : 'The service rejected it.',
          }),
        );
    };
  }, [repository]);

  const ask = async () => {
    const text = query.trim();
    if (!text || sending.current || active || unavailable) return;
    sending.current = true;
    setSubmitting(true);
    setError(undefined);
    try {
      const current =
        held.current ??
        (await repository.openSearchSession({
          workspace_id: workspaceId,
          ...(parentSessionId ? { parent_session_id: parentSessionId } : {}),
        }));
      if (!alive.current) {
        await repository.deleteSession(current.id);
        return;
      }
      held.current = current;
      setSession(current);
      const id = `search-${crypto.randomUUID()}`;
      await repository.submitMessage(current.id, {
        client_message_id: id,
        idempotency_key: id,
        behavior: { execution_mode: 'execute', confirmation_policy: 'ask' },
        delivery: 'start',
        ...(model ? { model: { provider_id: model.providerId, model_id: model.id } } : {}),
        parts: [{ type: 'text', text }],
      });
      if (alive.current) onQueryChange('');
    } catch (reason) {
      if (alive.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'The connected service could not start the search assistant.',
        );
    } finally {
      sending.current = false;
      if (alive.current) setSubmitting(false);
    }
  };
  return (
    <div className="flex min-h-0 flex-col" data-slot="search-assistant">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Back to search results"
          title="Back to search results (Shift+Tab or Esc)"
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </Button>
        <SparklesIcon aria-hidden="true" className="size-4 text-info" />
        <span className="text-sm font-semibold">{vocab.agent} Search</span>
        <ClioModelPicker
          title={`Choose ${vocab.agent} Search model`}
          options={options}
          model={model?.id ?? session?.model_id ?? fleet.data?.search?.model_id}
          provider={model?.providerId ?? session?.provider_id ?? fleet.data?.search?.provider_id}
          catalogStatus={catalog.isPending ? 'loading' : catalog.isError ? 'error' : 'ready'}
          onRetryCatalog={() => void catalog.refetch()}
          onChange={setModel}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto min-w-0 max-w-[45%] shrink gap-1 px-1.5 text-xs font-normal"
              aria-label={`Choose ${vocab.agent} Search model`}
              disabled={submitting || active || unavailable}
            >
              <span className="truncate">
                {model?.id ??
                  session?.model_id ??
                  fleet.data?.search?.model_id ??
                  'Conversation or service model'}
              </span>
              <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0" />
            </Button>
          }
        />
        <Link className="text-xs text-primary" to="/settings/fleet" onClick={onClose}>
          Fleet
        </Link>
      </div>
      <form
        className="flex gap-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <Input
          autoFocus
          aria-label={`Ask ${vocab.agent} Search`}
          placeholder="Ask about conversations, messages, and files…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Tab' && event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onBack();
            }
          }}
        />
        <Button
          type="submit"
          aria-label={`Search with ${vocab.agent}`}
          disabled={!query.trim() || submitting || active || unavailable}
        >
          <SendIcon className="size-4" />
        </Button>
      </form>
      <p className="px-3 pb-2 text-xs text-muted-foreground">
        Read-only search across this connected service’s workspaces.
      </p>
      {unavailable ? (
        <p role="status" className="px-3 pb-3 text-sm">
          Search is unavailable on this connection. Update its agent to enable it.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mx-3 mb-3 rounded-md border border-destructive p-3 text-sm">
          {error}
        </p>
      ) : null}
      {session ? (
        <div
          className="h-[48dvh] min-h-48 border-t"
          onClick={(event) => {
            const link = (event.target as HTMLElement).closest('a');
            if (link?.getAttribute('href')?.startsWith('/workspaces/')) onClose();
          }}
        >
          <ClioConversation
            sessionId={session.id}
            workspaceId={session.workspace_id}
            messages={messages}
            tools={entities.tools}
            tasks={entities.tasks}
            subagents={entities.subagents}
            artifacts={entities.artifacts}
            surfaces={entities.surfaces}
            loading={transcript.isPending}
            error={transcript.error?.message}
            onOpenFileReference={(path, location) => {
              onOpenResource?.({
                kind: 'workspace-file',
                ...location,
                workspaceId: location.workspaceId ?? session.workspace_id,
                path,
              });
              onClose();
            }}
          />
        </div>
      ) : (
        <div className="px-6 py-10 text-center text-sm text-muted-foreground">
          Find a previous decision, locate a passage, or ask what your files say.
          <br />
          Press Enter to search with the selected model.
        </div>
      )}
      {submitting || active ? (
        <p role="status" className="px-3 pb-3 text-xs text-muted-foreground">
          Searching…
        </p>
      ) : null}
    </div>
  );
}
