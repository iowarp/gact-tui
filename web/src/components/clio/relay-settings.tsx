import { queryKeys } from '@/lib/query-keys';
import { OPERATIONS_POLL_MS } from '@/lib/runtime-limits';
import type { RelayConnectionInput, RelayStatus } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CableIcon, KeyRoundIcon, PencilIcon, RefreshCwIcon, UnplugIcon } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioRelativeTime } from './relative-time';
import { ClioStatus } from './status';

/** Manage the connected agent's process-local remote execution service. */
export function RelaySettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [editorOpen, setEditorOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const relay = useQuery({
    queryKey: queryKeys.key('relay-status', settings.endpoint),
    queryFn: ({ signal }) => repository.relayStatus(signal),
    refetchInterval: OPERATIONS_POLL_MS,
  });
  const refreshSurfaces = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.key('relay-status', settings.endpoint) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.key('service-health', settings.endpoint),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.key('tools', settings.endpoint) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.key('capabilities', settings.endpoint) }),
    ]);
  };
  const connect = useMutation({
    mutationFn: (input: RelayConnectionInput) => repository.configureRelay(input),
    onSuccess: async () => {
      setEditorOpen(false);
      await refreshSurfaces();
      toast.success('Remote work connection updated');
    },
    onError: (error) => toast.error(error.message),
  });
  const disconnect = useMutation({
    mutationFn: () => repository.disconnectRelay(),
    onSuccess: async () => {
      setDisconnectOpen(false);
      await refreshSurfaces();
      toast.success('Remote work disconnected');
    },
    onError: (error) => toast.error(error.message),
  });
  const value = relay.data;

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Settings</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Remote computers</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          CLIO Relay keeps long-running work, progress, and artifacts connected to this workspace.
          Use this page to connect a Relay that is already running.
        </p>
      </header>

      <Frame spacing="lg">
        <FrameHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <FrameTitle>CLIO Relay</FrameTitle>
              <FrameDescription>{relayConnectionDescription(value)}</FrameDescription>
            </div>
            <RelayState pending={relay.isPending} value={value} />
          </div>
        </FrameHeader>
        <FramePanel className="grid gap-3">
          <StatusRow label="Relay" value={value?.configured ? 'Connected' : 'Not connected'} />
          <StatusRow
            label="Reachability"
            value={
              value?.reachable === undefined
                ? 'Not checked'
                : value.reachable
                  ? 'Reachable'
                  : 'Unreachable'
            }
          />
          <StatusRow
            label="Last checked"
            value={
              value?.checked_at ? (
                <ClioRelativeTime label="Last checked" timestamp={value.checked_at} />
              ) : (
                'Not checked'
              )
            }
          />
          {value ? <RelayGuidance value={value} /> : null}
          {relay.error ? (
            <Alert variant="destructive">
              <AlertTitle>Remote work status unavailable</AlertTitle>
              <AlertDescription>{relay.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </FramePanel>
        <FrameFooter className="flex-row flex-wrap items-center justify-between gap-2">
          <Button onClick={() => void relay.refetch()} size="sm" variant="outline">
            <RefreshCwIcon aria-hidden="true" /> Check again
          </Button>
          <div className="flex flex-wrap gap-2">
            {value?.configured ? (
              <Button onClick={() => setDisconnectOpen(true)} size="sm" variant="outline">
                <UnplugIcon aria-hidden="true" /> Disconnect
              </Button>
            ) : null}
            <Button
              disabled={value?.can_manage === false}
              onClick={() => setEditorOpen(true)}
              size="sm"
            >
              {value?.configured ? (
                <PencilIcon aria-hidden="true" />
              ) : (
                <CableIcon aria-hidden="true" />
              )}
              {value?.configured ? 'Edit connection' : 'Connect existing Relay'}
            </Button>
          </div>
        </FrameFooter>
      </Frame>

      {editorOpen ? (
        <RelayConnectionDialog
          error={connect.error?.message}
          onOpenChange={setEditorOpen}
          onSubmit={(input) => connect.mutate(input)}
          open
          pending={connect.isPending}
          value={value}
        />
      ) : null}

      <AlertDialog onOpenChange={setDisconnectOpen} open={disconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect remote work?</AlertDialogTitle>
            <AlertDialogDescription>
              New remote jobs will be unavailable to this agent. Existing server-managed settings
              return when the agent service restarts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
              variant="destructive"
            >
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RelayConnectionDialog({
  error,
  onOpenChange,
  onSubmit,
  open,
  pending,
  value,
}: {
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: RelayConnectionInput) => void;
  open: boolean;
  pending: boolean;
  value?: RelayStatus;
}) {
  const [mcpUrl, setMcpUrl] = useState(value?.mcp_url ?? '');
  const [httpUrl, setHttpUrl] = useState(value?.http_url ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [credentialOpen, setCredentialOpen] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      mcp_url: mcpUrl.trim(),
      http_url: httpUrl.trim(),
      access_token: accessToken.trim() || undefined,
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {value?.configured ? 'Edit Relay connection' : 'Connect an existing CLIO Relay'}
            </DialogTitle>
            <DialogDescription>
              This connects a Relay that is already running. It does not deploy Relay or configure a
              remote computer over SSH.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <CableIcon aria-hidden="true" />
            <AlertTitle>Connect to Relay, then add computers there</AlertTitle>
            <AlertDescription>
              These addresses belong to CLIO Relay. Relay can reach a computer through its direct
              connection point or an SSH fallback; those computer details are configured in Relay,
              not in this form.
            </AlertDescription>
          </Alert>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="relay-mcp-url">MCP address</FieldLabel>
              <Input
                autoComplete="url"
                id="relay-mcp-url"
                onChange={(event) => setMcpUrl(event.target.value)}
                placeholder="https://relay.example.org/mcp"
                required
                type="url"
                value={mcpUrl}
              />
              <FieldDescription>
                The agent uses this MCP endpoint to submit work and follow its state.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="relay-http-url">Results address</FieldLabel>
              <Input
                autoComplete="url"
                id="relay-http-url"
                onChange={(event) => setHttpUrl(event.target.value)}
                placeholder="https://relay.example.org"
                required
                type="url"
                value={httpUrl}
              />
              <FieldDescription>
                Used to retrieve progress, output, and artifacts from the same Relay.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="relay-access-token">Access credential</FieldLabel>
              {credentialOpen ? (
                <>
                  <Input
                    autoComplete="new-password"
                    id="relay-access-token"
                    name="clio-relay-access-token"
                    onChange={(event) => setAccessToken(event.target.value)}
                    placeholder={
                      value?.credential_configured
                        ? 'Leave blank to keep the current credential'
                        : 'Enter access credential'
                    }
                    required={!value?.credential_configured}
                    type="password"
                    value={accessToken}
                  />
                  <FieldDescription>
                    {value?.credential_configured
                      ? 'Leave this empty to keep the current credential.'
                      : 'The credential stays only in the connected agent process.'}
                  </FieldDescription>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm text-muted-foreground">
                    {value?.credential_configured
                      ? 'The current credential will be kept.'
                      : 'A credential is required to connect.'}
                  </p>
                  <Button
                    onClick={() => setCredentialOpen(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <KeyRoundIcon aria-hidden="true" />
                    {value?.credential_configured ? 'Replace credential' : 'Enter credential'}
                  </Button>
                </div>
              )}
            </Field>
          </FieldGroup>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={
                pending ||
                !mcpUrl.trim() ||
                !httpUrl.trim() ||
                (!value?.credential_configured && !accessToken.trim())
              }
              type="submit"
            >
              {pending ? 'Connecting…' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RelayState({ pending, value }: { pending: boolean; value?: RelayStatus }) {
  return (
    <ClioStatus
      label={
        pending
          ? 'Checking'
          : value?.reachable
            ? 'Ready'
            : value?.configured
              ? 'Needs attention'
              : 'Not connected'
      }
      value={
        pending
          ? 'connecting'
          : value?.reachable
            ? 'healthy'
            : value?.configured
              ? 'degraded'
              : 'unavailable'
      }
    />
  );
}

function RelayGuidance({ value }: { value: RelayStatus }) {
  const missing = Array.isArray(value.details.missing)
    ? value.details.missing.filter((item): item is string => typeof item === 'string')
    : [];
  const labels: Record<string, string> = {
    api_token: 'Access credential',
    http_url: 'Jobs and artifacts address',
    mcp_url: 'Control service address',
  };
  if (value.reason === 'relay_tools_not_configured') {
    return (
      <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
        <p className="text-sm font-medium">Remote work is not connected</p>
        <p className="text-sm text-muted-foreground">
          Connect the missing details to dispatch and follow work on other machines.
        </p>
        {missing.length ? (
          <div className="flex flex-wrap gap-2">
            {missing.map((item) => (
              <Badge key={item} variant="outline">
                {labels[item] ?? 'Connection detail'}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  if (value.reason === 'relay_endpoint_invalid') {
    return <p className="text-sm text-muted-foreground">One saved address is not valid.</p>;
  }
  if (value.reason === 'relay_tcp_unreachable') {
    return (
      <p className="text-sm text-muted-foreground">
        The connection is saved, but this agent cannot currently reach it.
      </p>
    );
  }
  return value.reachable ? (
    <div className="grid gap-2 text-sm text-muted-foreground">
      <p>Remote jobs and artifacts are available to this agent.</p>
      <details>
        <summary className="cursor-pointer">Technical details</summary>
        <dl className="mt-2 grid gap-1 break-all font-mono text-xs">
          <div>Control: {value.mcp_url ?? 'Unavailable'}</div>
          <div>Jobs and artifacts: {value.http_url ?? 'Unavailable'}</div>
        </dl>
      </details>
    </div>
  ) : null;
}

function relayConnectionDescription(value?: RelayStatus): string {
  if (!value) return 'Checking the connected agent.';
  if (value.reachable) return `Ready through ${value.host ?? 'the configured service'}.`;
  if (value.configured) return 'Configured, but currently unavailable.';
  return 'No remote execution service is connected.';
}

function StatusRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
