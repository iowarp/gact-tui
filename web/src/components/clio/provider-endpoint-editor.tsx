import type { LanguageModelPreset } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { isLocalServerPreset, normalizeServerAddress } from '@/lib/local-servers';

/** Edit a self-hosted server through the same saved-address owner as Settings. */
export function ProviderEndpointEditor({
  preset,
  endpoint,
}: {
  preset: LanguageModelPreset;
  endpoint?: string;
}) {
  const address = endpoint || preset.api_base || '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(address);
  const { save } = useSavedServers({ enabled: false });
  if (!isLocalServerPreset(preset)) return null;
  const typed = normalizeServerAddress(draft, preset.provider === 'ollama' ? '/' : '/v1');

  async function saveAddress() {
    if (!typed) return;
    try {
      await save.mutateAsync({ address: typed, presetId: preset.id });
      setEditing(false);
    } catch {
      // The shared mutation exposes the server error; retain the person's draft.
    }
  }

  return (
    <div className="min-w-0 shrink-0 space-y-2 border-t px-3 py-2" data-slot="provider-endpoint">
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAddress();
          }}
        >
          <Input
            aria-label={`${preset.label} URL`}
            autoComplete="url"
            autoFocus
            className="h-8 min-w-0 text-xs"
            value={draft}
            disabled={save.isPending}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            <Button disabled={!typed || save.isPending} size="xs" type="submit">
              {save.isPending ? 'Saving and checking…' : 'Save and check'}
            </Button>
            <Button
              disabled={save.isPending}
              size="xs"
              type="button"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
          {!typed ? (
            <p className="text-xs text-muted-foreground">Enter an HTTP or HTTPS server URL.</p>
          ) : null}
        </form>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={address}>
            {address}
          </span>
          <Button
            size="xs"
            type="button"
            variant="outline"
            onClick={() => {
              setDraft(address);
              save.reset();
              setEditing(true);
            }}
          >
            Change URL
          </Button>
        </div>
      )}
      {save.error ? (
        <p className="text-xs text-destructive" role="alert">
          {save.error.message}
        </p>
      ) : null}
    </div>
  );
}
