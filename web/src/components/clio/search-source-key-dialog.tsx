import { useState } from 'react';
import type { SearchSource } from '@clio/core/v3';
import { KeyRoundIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink } from '@/components/ui/external-link';
import { searchSourceText } from '@/lib/search-source-text';
import { DialogFrame } from './primitives/dialog-frame';
import { t } from '@lingui/core/macro';

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
  const name = source?.name ?? t`source`;
  const save = () => {
    if (key.trim() && !saving) onSave(key.trim());
  };
  return (
    <DialogFrame
      confirm={{
        label: saving ? t`Saving…` : t`Save key`,
        disabled: saving || !key.trim(),
        onConfirm: save,
      }}
      description={searchSourceText(source?.key_benefit) || undefined}
      icon={<KeyRoundIcon className="size-3.5" />}
      onOpenChange={(open) => {
        if (!open && !saving) close();
      }}
      open={Boolean(source)}
      title={t`Add your ${name} key`}
    >
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Label htmlFor="search-source-key">{t`Key`}</Label>
        <Input
          autoComplete="off"
          autoFocus
          id="search-source-key"
          onChange={(event) => setKey(event.target.value)}
          placeholder={t`Paste your ${name} key`}
          spellCheck={false}
          type="password"
          value={key}
        />
        <p className="text-xs text-muted-foreground">
          {t`The key is saved securely and never shown again.`}
          {source?.key_page ? (
            <>
              {' '}
              <ExternalLink
                className="text-primary underline-offset-2 hover:underline"
                href={source.key_page}
              >
                {t`Get a key`}
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
