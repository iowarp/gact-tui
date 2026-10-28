import type { McpSignIn } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { connectionScope } from '@/lib/connection-scope';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { receiveBrowserSignIn } from '@/tauri/oauth';
import { prepareExternalUrl } from '@/tauri/external-url';
import { ExternalLink } from '@/components/ui/external-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const TERMINAL = new Set(['connected', 'denied', 'expired', 'failed', 'cancelled']);

/** One consent surface, shared by library, setup and service details. */
export function McpSignInDialog({
  name,
  title,
  onClose,
  onConnected,
}: {
  name: string;
  title?: string;
  onClose: () => void;
  onConnected?: () => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const [initiatingScope] = useState(scope);
  const client = useQueryClient();
  const [started, setStarted] = useState<McpSignIn>();
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [metadataUrl, setMetadataUrl] = useState('');
  const controller = useRef<AbortController | null>(null);
  const active = useRef<McpSignIn | undefined>(undefined);
  const browser = useRef<ReturnType<typeof prepareExternalUrl> | null>(null);
  const finished = useRef(false);
  const completing = useRef(false);
  const state = useQuery({
    queryKey: ['mcp-sign-in', scope, name, started?.flow_id],
    queryFn: ({ signal }) => repository.mcpSignIn(name, started!.flow_id, signal),
    enabled: Boolean(started?.flow_id) && scope === initiatingScope,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && TERMINAL.has(query.state.data.state) ? false : 1000,
  });
  const flow = state.data ?? started;
  active.current = flow;
  useEffect(() => {
    if (scope !== initiatingScope) onClose();
  }, [scope, initiatingScope, onClose]);

  useEffect(
    () => () => {
      controller.current?.abort();
      browser.current?.cancel();
      const current = active.current;
      if (current && !TERMINAL.has(current.state))
        void repository.cancelMcpSignIn(name, current.flow_id).catch(() => undefined);
    },
    [name, repository],
  );

  const complete = async (url: string) => {
    const current = active.current;
    if (!current || current.state !== 'authorizing' || completing.current) return;
    completing.current = true;
    try {
      const result = await repository.completeMcpSignIn(name, current.flow_id, url);
      setStarted(result);
      client.setQueryData(['mcp-sign-in', scope, name, current.flow_id], result);
      setCallbackUrl('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not finish signing in');
    } finally {
      completing.current = false;
    }
  };

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('clio-mcp-sign-in');
    channel.onmessage = (event) => {
      const current = active.current;
      if (
        event.data?.type !== 'mcp-return' ||
        typeof event.data.callback_url !== 'string' ||
        !current?.authorization_url
      )
        return;
      try {
        const returned = new URL(event.data.callback_url);
        const expected = new URL(current.authorization_url).searchParams.get('state');
        if (
          returned.origin === location.origin &&
          returned.pathname === '/oauth/mcp' &&
          expected &&
          returned.searchParams.get('state') === expected
        )
          void complete(returned.href);
      } catch {
        /* Unrelated messages cannot consume this attempt. */
      }
    };
    return () => channel.close();
    // The captured repository/connection owns this exact pending sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, repository, settings.endpoint]);

  useEffect(() => {
    if (flow?.state !== 'connected' || finished.current) return;
    finished.current = true;
    browser.current?.cancel();
    void Promise.all(
      (['mcp-configurations', 'mcp-servers', 'tools'] as const).map((key) =>
        client.invalidateQueries({ queryKey: queryKeys.key(key, settings.endpoint) }),
      ),
    );
    toast.success(`Connected ${title || name}`, {
      description: `${flow.tools.length} ${flow.tools.length === 1 ? 'tool' : 'tools'} available`,
    });
    onConnected?.();
  }, [flow, client, settings.endpoint, name, title, onConnected]);

  async function start() {
    if (scope !== initiatingScope) return;
    setError('');
    setPreparing(true);
    finished.current = false;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    browser.current?.cancel();
    const reserved = inTauri() ? null : prepareExternalUrl();
    browser.current = reserved;
    const begin = async (redirectUri: string) => {
      const result = await repository.startMcpSignIn(
        name,
        {
          redirect_uri: redirectUri,
          client_id: clientId || undefined,
          client_secret: clientSecret || undefined,
          client_metadata_url: metadataUrl || undefined,
        },
        abort.signal,
      );
      setClientSecret('');
      if (abort.signal.aborted) {
        void repository.cancelMcpSignIn(name, result.flow_id).catch(() => undefined);
        throw new DOMException('Sign-in cancelled', 'AbortError');
      }
      setStarted(result);
      active.current = result;
      return result;
    };
    try {
      if (inTauri()) {
        await receiveBrowserSignIn({
          provider: 'mcp',
          signal: abort.signal,
          start: begin,
          complete: async (result, url) => {
            setStarted(await repository.completeMcpSignIn(name, result.flow_id, url, abort.signal));
          },
        });
      } else {
        const result = await begin(`${location.origin}/oauth/mcp`);
        if (result.authorization_url) await reserved?.open(result.authorization_url);
        else reserved?.cancel();
      }
    } catch (reason) {
      if (!abort.signal.aborted)
        setError(reason instanceof Error ? reason.message : 'Could not start signing in');
      reserved?.cancel();
    } finally {
      setClientSecret('');
      setPreparing(false);
    }
  }

  const pending = preparing || (flow && !TERMINAL.has(flow.state));
  return (
    <Dialog
      open={scope === initiatingScope}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect {title || name}</DialogTitle>
          <DialogDescription>
            Sign in with the service. Your credentials stay with this connection.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {pending ? (
            <p role="status">
              {flow?.state === 'authorizing'
                ? 'Finish signing in in the browser window.'
                : flow?.state === 'connecting'
                  ? 'Checking the MCP connection…'
                  : 'Preparing sign-in…'}
            </p>
          ) : null}
          {flow?.authorization_url ? (
            <ExternalLink href={flow.authorization_url} className="text-sm underline">
              Continue signing in
            </ExternalLink>
          ) : null}
          {flow?.state === 'connected' ? (
            <p role="status">
              Connected, {flow.tools.length} {flow.tools.length === 1 ? 'tool' : 'tools'} available
            </p>
          ) : null}
          {error || flow?.error || state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {error || flow?.error || state.error?.message}
            </p>
          ) : null}
          {!pending && flow?.state !== 'connected' ? (
            <>
              <details className="text-sm">
                <summary className="cursor-pointer">Advanced sign-in settings</summary>
                <div className="grid gap-3 pt-3">
                  <p className="text-muted-foreground">
                    Automatic registration is used when the server supports it. Enter a registered
                    client or a published client metadata URL only if your server requires one.
                  </p>
                  <Label>
                    Client ID
                    <Input
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      autoComplete="off"
                    />
                  </Label>
                  <Label>
                    Client secret
                    <Input
                      type="password"
                      value={clientSecret}
                      onChange={(event) => setClientSecret(event.target.value)}
                      autoComplete="new-password"
                    />
                  </Label>
                  <Label>
                    Published client metadata URL
                    <Input
                      type="url"
                      value={metadataUrl}
                      onChange={(event) => setMetadataUrl(event.target.value)}
                    />
                  </Label>
                </div>
              </details>
              <Button onClick={() => void start()}>
                {flow ? 'Try signing in again' : 'Sign in'}
              </Button>
            </>
          ) : null}
          {flow?.state === 'authorizing' && !inTauri() ? (
            <details className="text-sm">
              <summary className="cursor-pointer">Finish with a return URL</summary>
              <div className="grid gap-2 pt-2">
                <Label htmlFor="mcp-return-url">Browser return URL</Label>
                <Input
                  id="mcp-return-url"
                  value={callbackUrl}
                  onChange={(event) => setCallbackUrl(event.target.value)}
                  autoComplete="off"
                />
                <Button disabled={!callbackUrl.trim()} onClick={() => void complete(callbackUrl)}>
                  Finish signing in
                </Button>
              </div>
            </details>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            {flow?.state === 'connected' ? 'Done' : 'Cancel'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
