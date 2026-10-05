import globusDark from '../../../../branding/provider-logos/globus-dark.png';
import globusLight from '../../../../branding/provider-logos/globus-light.png';
import driveLogo from '../../../../branding/provider-logos/google-drive.png';
import githubBlack from '../../../../branding/provider-logos/github-black.svg';
import githubWhite from '../../../../branding/provider-logos/github-white.svg';
import type { SourceProviderId } from '@clio/core/v3';
import { FolderIcon, TerminalIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Original provider artwork; protocol-based sources use the shared system glyphs. */
export function SourceProviderLogo({
  provider,
  size = 'row',
}: {
  provider: SourceProviderId;
  size?: 'row' | 'detail';
}) {
  const detail = size === 'detail';
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border bg-muted/20',
        detail ? 'h-20 w-48 max-w-[40%] p-2' : 'h-9 w-16',
      )}
    >
      {provider === 'google_drive' ? (
        <img
          alt=""
          src={driveLogo}
          className={cn('object-contain', detail ? 'size-14' : 'size-7')}
        />
      ) : provider === 'globus' ? (
        <>
          <img
            alt=""
            src={globusLight}
            className={cn('object-contain dark:hidden', detail ? 'w-full' : 'w-14')}
          />
          <img
            alt=""
            src={globusDark}
            className={cn('hidden object-contain dark:block', detail ? 'w-full' : 'w-14')}
          />
        </>
      ) : provider === 'github' ? (
        <>
          <img
            alt=""
            src={githubBlack}
            className={cn('object-contain dark:hidden', detail ? 'size-14' : 'size-7')}
          />
          <img
            alt=""
            src={githubWhite}
            className={cn('hidden object-contain dark:block', detail ? 'size-14' : 'size-7')}
          />
        </>
      ) : provider === 'sftp' ? (
        <TerminalIcon aria-hidden="true" className={detail ? 'size-10' : 'size-5'} />
      ) : (
        <FolderIcon aria-hidden="true" className={detail ? 'size-10' : 'size-5'} />
      )}
    </span>
  );
}
