import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, GlobeIcon, UnplugIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { vocab } from '@/lib/brand-vocabulary';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { WEB_MCP_COMMAND, WEB_MCP_ENV, webSearchMcpArgs } from '@/lib/web-search-service';
import { useConnectionSettings } from '@/providers/connection-provider';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { remoteUrlFromSpec } from './web-search-configuration';
import { plural, t } from '@lingui/core/macro';
import { formatDateTime } from '@/lib/locale-format';

/** Connect an externally managed Web Search endpoint; deployment lives in ManagedServices. */
export function WebSearchSetup({
  onOpenChange,
  open,
  onBack,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  onBack?: () => void;
}) {
  const { agent } = vocab;
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
  const checked = external?.checked_at ? formatDateTime(external.checked_at) : undefined;
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
        // i18n-ignore: the service's registered name, stored by the server
        label: 'CLIO Web Search',
        url: effectiveUrl.trim(),
        credential_ref: effectiveCredentialRef.trim(),
      };
      if (supportsExternalRegistry) {
        if (external) await repository.updateExternalServiceConnection(external.id, definition);
        else await repository.createExternalServiceConnection(definition);
      }
      return repository.configureMcpServer('web', {
        // i18n-ignore: the MCP server's configured name, stored by the server
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
        throw new Error(result.error ?? t`The endpoint did not report its tools.`);
      }
      toast.success(
        plural(result.tools_count, {
          one: 'CLIO Web Search connected with # tool',
          other: 'CLIO Web Search connected with # tools',
        }),
      );
      onOpenChange(false);
    },
  });
  const check = useMutation({
    mutationFn: async () => {
      if (!external) throw new Error(t`Save this endpoint before checking it.`);
      return repository.checkExternalServiceConnection(external.id);
    },
    onSuccess: async (result) => {
      await refresh();
      toast[result.reachable ? 'success' : 'error'](
        result.reachable ? t`Web Search is reachable` : t`Web Search did not answer`,
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
      toast.success(t`Web Search disconnected`);
      onOpenChange(false);
    },
  });
  const error = connect.error ?? check.error ?? disconnect.error;

  const connectLabel = connect.isPending
    ? t`Checking…`
    : current.data?.status === 'degraded'
      ? t`Retry connection`
      : external
        ? t`Save and reconnect`
        : t`Connect`;

  return (
    <DialogFrame
      confirm={{
        label: connectLabel,
        disabled: !effectiveUrl.trim() || connect.isPending,
        onConfirm: () => connect.mutate(),
      }}
      description={t`A search service run outside ${agent}. ${agent} checks it and uses its tools.`}
      footerStart={
        onBack ? (
          <Button className="-ml-2" onClick={onBack} size="sm" variant="ghost">
            <ArrowLeftIcon aria-hidden="true" />
            {t`Back`}
          </Button>
        ) : undefined
      }
      icon={<GlobeIcon />}
      onOpenChange={onOpenChange}
      open={open}
      title={t`Connect CLIO Web Search`}
      titleActions={
        <>
          {external ? (
            <IconButton
              disabled={check.isPending}
              icon={check.isPending ? <Spinner aria-hidden="true" /> : <RefreshIcon />}
              label={t`Recheck`}
              onClick={() => check.mutate()}
            />
          ) : null}
          {external || configuredUrl ? (
            <IconButton
              disabled={disconnect.isPending}
              icon={disconnect.isPending ? <Spinner aria-hidden="true" /> : <UnplugIcon />}
              label={t`Disconnect`}
              onClick={() => disconnect.mutate()}
            />
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field className="gap-1.5">
          <FieldLabel className="text-xs" htmlFor="existing-web-search-url">
            {t`Service address`}
          </FieldLabel>
          <Input
            className="h-[30px] font-mono text-menu md:text-menu"
            data-initial-focus=""
            id="existing-web-search-url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://search.example.edu"
            type="url"
            value={effectiveUrl}
          />
        </Field>
        <Field className="gap-1.5">
          <FieldLabel className="text-xs" htmlFor="existing-web-search-credential">
            {t`Credential reference`}
          </FieldLabel>
          <Input
            className="h-[30px] text-menu md:text-menu"
            id="existing-web-search-credential"
            onChange={(event) => setCredentialRef(event.target.value)}
            placeholder={t`Optional, e.g. infrastructure:nsf-search`}
            title={t`A key in ${agent}’s credential source; the secret is never stored here.`}
            value={effectiveCredentialRef}
          />
        </Field>
        {external ? (
          <p className="text-xs text-muted-foreground">
            {checked
              ? external.reachable
                ? t`Reachable, checked ${checked}`
                : t`Not reachable, checked ${checked}`
              : external.reachable
                ? t`Reachable`
                : t`Not reachable`}
          </p>
        ) : null}
        {current.data?.status === 'degraded' ? (
          <div title={current.data.error ?? undefined}>
            <StateView
              kind="error"
              size="row"
              title={t`Saved, but the service isn’t answering. Start it or fix the address.`}
            />
          </div>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error.message}</p> : null}
      </div>
    </DialogFrame>
  );
}
