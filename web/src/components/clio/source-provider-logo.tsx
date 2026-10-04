import type { SourceProviderId } from '@clio/core/v3';
import { FolderIcon, TerminalIcon } from 'lucide-react';

/** Original provider artwork; protocol-based sources use the shared system glyphs. */
export function SourceProviderLogo({ provider }: { provider: SourceProviderId }) {
  return (
    <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md border bg-muted/20">
      {provider === 'google_drive' ? (
        <img alt="" src="/provider-logos/google-drive.png" className="size-7 object-contain" />
      ) : provider === 'globus' ? (
        <>
          <img
            alt=""
            src="/provider-logos/globus-light.png"
            className="w-14 object-contain dark:hidden"
          />
          <img
            alt=""
            src="/provider-logos/globus-dark.png"
            className="hidden w-14 object-contain dark:block"
          />
        </>
      ) : provider === 'sftp' ? (
        <TerminalIcon aria-hidden="true" className="size-5" />
      ) : (
        <FolderIcon aria-hidden="true" className="size-5" />
      )}
    </span>
  );
}
