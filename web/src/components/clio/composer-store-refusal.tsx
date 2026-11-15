import { AlertTriangleIcon } from 'lucide-react';
import { t } from '@lingui/core/macro';

/**
 * Under the composer: the last message was refused because CLIO's conversation
 * store refuses writes (it is full). The service's own sentence says why and what
 * to do; it stays until a message is accepted, so the refusal is part of the
 * conversation rather than a toast that fades (MC-F3).
 */
export function ComposerStoreRefusal({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      className="flex items-start gap-2 px-3 pt-2 text-xs text-destructive"
      data-slot="store-refusal"
      role="alert"
    >
      <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <p className="min-w-0">
        <span className="font-medium">{t`Your message was not saved.`}</span> {message}
      </p>
    </div>
  );
}
