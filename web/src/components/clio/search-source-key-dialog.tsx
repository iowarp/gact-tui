import { useState } from 'react';
import type { SearchSource } from '@clio/core/v3';
import { KeyRoundIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink } from '@/components/ui/external-link';
import { DialogFrame } from './primitives/dialog-frame';

/**
 * Add the person's own key for one search source. The key goes to the server's credential
 * store and is never shown again; the field clears whenever the dialog closes.
 */
export function SearchSourceKeyDialog({
  source,
  saving,
  error,
  onSave,
  onClose,
}: {
  source: SearchSource | undefined;
  saving: boolean;
  error: string;
  onSave: (key: string) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState('');
  const close = () => {
    setKey('');
    onClose();
  };
  const name = source?.name ?? 'source';
  const save = () => {
    if (key.trim() && !saving) onSave(key.trim());
  };
  return (
    <DialogFrame
      confirm={{
        label: saving ? 'Saving…' : 'Save key',
        disabled: saving || !key.trim(),
        onConfirm: save,
      }}
      description={source?.key_benefit || undefined}
      icon={<KeyRoundIcon className="size-3.5" />}
      onOpenChange={(open) => {
        if (!open && !saving) close();
      }}
      open={Boolean(source)}
      title={`Add your ${name} key`}
    >
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Label htmlFor="search-source-key">Key</Label>
        <Input
          autoComplete="off"
          autoFocus
          id="search-source-key"
          onChange={(event) => setKey(event.target.value)}
          placeholder={`Paste your ${name} key`}
          spellCheck={false}
          type="password"
          value={key}
        />
        <p className="text-xs text-muted-foreground">
          The key is saved securely and never shown again.
          {source?.key_page ? (
            <>
              {' '}
              <ExternalLink
                className="text-primary underline-offset-2 hover:underline"
                href={source.key_page}
              >
                Get a key
              </ExternalLink>
            </>
          ) : null}
        </p>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </DialogFrame>
  );
}
