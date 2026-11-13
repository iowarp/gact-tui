import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NDPEndpointConnection, NDPEndpointInput } from '@clio/core/v3';
import { AddIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { NDPEndpointBrowser } from './ndp-endpoint-browser';
import { NDPEndpointEditor } from './ndp-endpoint-editor';
import { NDPEndpointActions } from './ndp-endpoint-actions';
import { ConnectedAccountSignIn } from './connected-source-auth';
import { t, ph } from '@lingui/core/macro';

/** Save and manage API connections independently of catalog file selections. */
export function NDPEndpointPanel({
  workspaceId,
  onBack,
  signedIn = false,
}: {
  workspaceId: string;
  /** Leaves the panel when its last endpoint editor is cancelled. */
  onBack: () => void;
  signedIn?: boolean;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const { settings } = useConnectionSettings();
  const key = ['ndp-endpoints', connectionScope(settings), workspaceId];
  const endpoints = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.ndpEndpointConnections(workspaceId, signal, true),
  });
  const [selected, setSelected] = useState('');
  const [accountReady, setAccountReady] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [editor, setEditor] = useState<'add' | NDPEndpointConnection>();
  const [needsAccount, setNeedsAccount] = useState(false);
  const remember = (endpoint: NDPEndpointConnection) => {
    client.setQueryData(key, (old: { endpoints: NDPEndpointConnection[] } | undefined) => ({
      endpoints: [...(old?.endpoints ?? []).filter((row) => row.id !== endpoint.id), endpoint],
    }));
  };
  const save = useMutation({
    mutationFn: (input: NDPEndpointInput) =>
      editor && editor !== 'add'
        ? repository.updateNdpEndpoint(workspaceId, editor.id, input)
        : repository.connectNdpEndpoint(workspaceId, input),
    onSuccess: (endpoint) => {
      remember(endpoint);
      setSelected(endpoint.id);
      setEditor(undefined);
    },
  });
  const visibility = useMutation({
    mutationFn: ({ endpoint, hidden }: { endpoint: NDPEndpointConnection; hidden: boolean }) =>
      repository.updateNdpEndpoint(workspaceId, endpoint.id, { hidden }),
    onSuccess: remember,
  });
  const remove = useMutation({
    mutationFn: (endpoint: NDPEndpointConnection) =>
      repository.disconnectNdpEndpoint(workspaceId, endpoint.id),
    onSuccess: (_, endpoint) => {
      client.setQueryData(key, (old: { endpoints: NDPEndpointConnection[] } | undefined) => ({
        endpoints: (old?.endpoints ?? []).filter((row) => row.id !== endpoint.id),
      }));
      setSelected('');
    },
  });
  const all = endpoints.data?.endpoints ?? [];
  const visible = all.filter((row) => showHidden || !row.hidden);
  const active = visible.find((row) => row.id === selected) ?? visible[0];
  const editing = editor || (!all.length && !endpoints.isPending);
  const authenticated = signedIn || accountReady;
  return (
    <section aria-label={t`NDP endpoints`} className="space-y-4">
      <div className="-mt-1 flex items-center justify-end gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            save.reset();
            setEditor('add');
          }}
        >
          <AddIcon /> {t`Connect endpoint`}
        </Button>
      </div>
      {!authenticated &&
      (needsAccount ||
        active?.authentication === 'ndp' ||
        (editor && editor !== 'add' && editor.authentication === 'ndp')) ? (
        <ConnectedAccountSignIn
          provider="ndp"
          onComplete={() => {
            setAccountReady(true);
            setNeedsAccount(false);
            void client.invalidateQueries({
              queryKey: ['connected-storage', connectionScope(settings)],
            });
          }}
        />
      ) : null}
      {endpoints.isPending ? <Skeleton className="h-10 w-full" /> : null}
      {endpoints.error || visibility.error ? (
        <p role="alert" className="text-sm text-destructive">
          {(endpoints.error ?? visibility.error)?.message}
        </p>
      ) : null}
      {editing ? (
        <NDPEndpointEditor
          key={typeof editor === 'object' ? editor.id : 'add'}
          initial={typeof editor === 'object' ? editor : undefined}
          pending={save.isPending}
          error={save.error}
          onSave={(input) => save.mutate(input)}
          onAuthentication={(value) => setNeedsAccount(value === 'ndp')}
          onCancel={() => {
            setEditor(undefined);
            setNeedsAccount(false);
            if (!all.length) onBack();
          }}
        />
      ) : (
        <>
          {all.some((row) => row.hidden) ? (
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={showHidden}
              onClick={() => setShowHidden(!showHidden)}
            >
              {showHidden
                ? t`Hide hidden endpoints`
                : t`Show hidden endpoints (${ph({ count: all.filter((row) => row.hidden).length })})`}
            </Button>
          ) : null}
          {active ? (
            <>
              <div className="flex items-center gap-1">
                <select
                  aria-label={t`Connected endpoint`}
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                  value={active.id}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {visible.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                      {row.ssh_route || row.ssh_profile
                        ? ` ${t`(SSH ${ph({ route: row.ssh_route?.profile || row.ssh_route?.host || row.ssh_profile || '' })})`}`
                        : ''}
                      {row.hidden ? ` ${t`(Hidden)`}` : ''}
                    </option>
                  ))}
                </select>
                <NDPEndpointActions
                  key={active.id}
                  endpoint={active}
                  pending={visibility.isPending || remove.isPending}
                  onEdit={() => {
                    save.reset();
                    setEditor(active);
                  }}
                  onHidden={(hidden) => visibility.mutate({ endpoint: active, hidden })}
                  onRemove={() => remove.mutateAsync(active)}
                />
              </div>
              <NDPEndpointBrowser
                key={`${active.id}/${active.observed_at}`}
                workspaceId={workspaceId}
                endpoint={active}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t`No visible endpoints. Connect an API or show hidden connections.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
