import globusDark from '../../../../branding/provider-logos/globus-dark.png';
import globusLight from '../../../../branding/provider-logos/globus-light.png';
import driveLogo from '../../../../branding/provider-logos/google-drive.png';
import type { SourceProviderId } from '@clio/core/v3';
import { FolderIcon, TerminalIcon } from 'lucide-react';

/** Original provider artwork; protocol-based sources use the shared system glyphs. */
export function SourceProviderLogo({ provider }: { provider: SourceProviderId }) {
  return (
    <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md border bg-muted/20">
      {provider === 'google_drive' ? (
        <img alt="" src={driveLogo} className="size-7 object-contain" />
      ) : provider === 'globus' ? (
        <>
          <img alt="" src={globusLight} className="w-14 object-contain dark:hidden" />
          <img alt="" src={globusDark} className="hidden w-14 object-contain dark:block" />
        </>
      ) : provider === 'sftp' ? (
        <TerminalIcon aria-hidden="true" className="size-5" />
      ) : (
        <FolderIcon aria-hidden="true" className="size-5" />
      )}
    </span>
  );
}
