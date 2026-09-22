import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { vocab } from '@/lib/brand-vocabulary';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { WEB_MCP_COMMAND, WEB_MCP_ENV, webSearchMcpArgs } from '@/lib/web-search-service';
import { useConnectionSettings } from '@/providers/connection-provider';
import { remoteUrlFromSpec } from './web-search-configuration';

/** Connect an externally managed Web Search endpoint; deployment lives in ManagedServices. */
export function WebSearchSetup({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [url, setUrl] = useState('');
  const [credentialRef, setCredentialRef] = useState('');
  const supportsExternalRegistry = typeof repository.externalServiceConnections === 'function';
  const connections = useQuery({
    enabled: open && supportsExternalRegistry,
    queryKey: ['infrastructure-service-connections', settings.endpoint],
    queryFn: ({ signal }) => repository.externalServiceConnections(signal),
  });
  const external = connections.data?.find((candidate) => candidate.service_id === 'web_search');
  const current = useQuery({
    enabled: open,
    queryKey: queryKeys.key('mcp-configuration', settings.endpoint, 'web'),
    queryFn: ({ signal }) => repository.mcpConfiguration('web', signal),
  });
  const configuredUrl = remoteUrlFromSpec(current.data?.spec) ?? '';
  const effectiveUrl = url || external?.url || configuredUrl;
  const effectiveCredentialRef = credentialRef || external?.credential_ref || '';
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.key('mcp-servers', settings.endpoint),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.key('tools', settings.endpoint) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.key('agents', settings.endpoint) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.key('mcp-configuration', settings.endpoint, 'web'),
      }),
      queryClient.invalidateQueries({
        queryKey: ['infrastructure-service-connections', settings.endpoint],
      }),
    ]);
  };
  const connect = useMutation({
    mutationFn: async () => {
      const definition = {
        service_id: 'web_search',
        label: 'CLIO Web Search',
        url: effectiveUrl.trim(),
        credential_ref: effectiveCredentialRef.trim(),
      };
      if (supportsExternalRegistry) {
        if (external) await repository.updateExternalServiceConnection(external.id, definition);
        else await repository.createExternalServiceConnection(definition);
      }
      return repository.configureMcpServer('web', {
        name: 'CLIO Web Search',
        transport: 'stdio',
        command: WEB_MCP_COMMAND,
        args: webSearchMcpArgs(effectiveUrl.trim()),
        env: WEB_MCP_ENV,
        always_load: true,
      });
    },
    onSuccess: async (result) => {
      await refresh();
      if (result.status !== 'ready') {
        throw new Error(result.error ?? 'The endpoint did not report its tools.');
      }
      toast.success(`CLIO Web Search connected with ${result.tools_count} tools`);
      onOpenChange(false);
    },
  });
  const check = useMutation({
    mutationFn: async () => {
      if (!external) throw new Error('Save this endpoint before checking it.');
      return repository.checkExternalServiceConnection(external.id);
    },
    onSuccess: async (result) => {
      await refresh();
      toast[result.reachable ? 'success' : 'error'](
        result.reachable ? 'Web Search is reachable' : 'Web Search did not answer',
      );
    },
  });
  const disconnect = useMutation({
    mutationFn: async () => {
      await repository.removeMcpConfiguration('web');
      if (supportsExternalRegistry && external) {
        await repository.deleteExternalServiceConnection(external.id);
      }
    },
    onSuccess: async () => {
      await refresh();
      toast.success('Web Search disconnected');
      onOpenChange(false);
    },
  });
  const error = connect.error ?? check.error ?? disconnect.error;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="top-[10dvh] grid max-h-[80dvh] translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect existing Web Search</DialogTitle>
          <DialogDescription>
            Use an endpoint managed outside this {vocab.agent}. Its lifecycle remains external.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <Alert>
            <Globe2Icon aria-hidden="true" />
            <AlertTitle>Connect an existing service</AlertTitle>
            <AlertDescription>
              {vocab.agent} checks health and connects tools, but does not install, stop, or remove
              this service. Search and HTML fetches can appear to work without it, but document
              conversion and saved outputs require this endpoint.
            </AlertDescription>
          </Alert>
          <Field>
            <FieldLabel htmlFor="existing-web-search-url">Service address</FieldLabel>
            <Input
              id="existing-web-search-url"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://search.example.edu"
              type="url"
              value={effectiveUrl}
            />
            <FieldDescription>
              The address must be reachable from the active {vocab.agent}.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="existing-web-search-credential">Credential reference</FieldLabel>
            <Input
              id="existing-web-search-credential"
              onChange={(event) => setCredentialRef(event.target.value)}
              placeholder="infrastructure:nsf-search"
              value={effectiveCredentialRef}
            />
            <FieldDescription>
              Optional key into the active {vocab.agent}’s credential source. Secrets are never
              stored in this service record.
            </FieldDescription>
          </Field>
          {external ? (
            <p className="text-xs text-muted-foreground">
              Health: {external.reachable ? 'reachable' : 'unreachable'}
              {external.checked_at
                ? ` · checked ${new Date(external.checked_at).toLocaleString()}`
                : ''}
            </p>
          ) : null}
          {current.data?.status === 'degraded' ? (
            <Alert variant="destructive">
              <AlertTitle>Configuration saved, service unavailable</AlertTitle>
              <AlertDescription>
                The address remains configured. Start the service or correct the address, then
                retry.
                {current.data.error ? (
                  <p className="mt-2 break-words font-mono text-xs">{current.data.error}</p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
        </div>
        <DialogFooter className="sm:justify-between">
          {external || configuredUrl ? (
            <Button
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
              type="button"
              variant="destructive"
            >
              {disconnect.isPending
                ? 'Disconnecting…'
                : current.data?.configured
                  ? 'Use local engines'
                  : 'Disconnect'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {external ? (
              <Button
                disabled={check.isPending}
                onClick={() => check.mutate()}
                type="button"
                variant="outline"
              >
                {check.isPending ? 'Checking…' : 'Recheck'}
              </Button>
            ) : null}
            <Button
              disabled={!effectiveUrl.trim() || connect.isPending}
              onClick={() => connect.mutate()}
              type="button"
            >
              {connect.isPending
                ? 'Checking…'
                : current.data?.status === 'degraded'
                  ? 'Retry connection'
                  : external
                    ? 'Save and reconnect'
                    : current.data?.name
                      ? 'Connect to agent'
                      : 'Connect'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
