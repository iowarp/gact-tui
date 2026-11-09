import globusDark from '../../../../branding/provider-logos/globus-dark.png';
import globusLight from '../../../../branding/provider-logos/globus-light.png';
import driveLogo from '../../../../branding/provider-logos/google-drive.png';
import githubBlack from '../../../../branding/provider-logos/github-black.svg';
import githubWhite from '../../../../branding/provider-logos/github-white.svg';
import obsidianLogo from '../../../../branding/provider-logos/obsidian.svg';
import ndpLight from '../../../../branding/provider-logos/ndp-light.png';
import ndpDark from '../../../../branding/provider-logos/ndp-dark.png';
import type { SourceProviderId } from '@clio/core/v3';
import { FolderIcon, TerminalIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Original provider artwork; protocol-based sources use the shared system glyphs. */
export function SourceProviderLogo({
  provider,
  size = 'row',
}: {
  provider: SourceProviderId;
  /** `icon` fits the 16px glyph slot of an item row, without a frame. */
  size?: 'row' | 'detail' | 'icon';
}) {
  const detail = size === 'detail';
  const icon = size === 'icon';
  const mark = icon ? 'size-4' : mark;
  const wordmark = icon ? 'size-4' : wordmark;
  const glyph = icon ? 'size-4' : detail ? 'size-10' : 'size-5';
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        icon ? 'size-4' : 'rounded-md border bg-muted/20',
        detail && 'h-20 w-48 max-w-[40%] p-2',
        size === 'row' && 'h-9 w-16',
      )}
    >
      {provider === 'google_drive' ? (
        <img alt="" src={driveLogo} className={cn('object-contain', mark)} />
      ) : provider === 'globus' ? (
        <>
          <img alt="" src={globusLight} className={cn('object-contain dark:hidden', wordmark)} />
          <img
            alt=""
            src={globusDark}
            className={cn('hidden object-contain dark:block', wordmark)}
          />
        </>
      ) : provider === 'github' ? (
        <>
          <img alt="" src={githubBlack} className={cn('object-contain dark:hidden', mark)} />
          <img alt="" src={githubWhite} className={cn('hidden object-contain dark:block', mark)} />
        </>
      ) : provider === 'obsidian' ? (
        <img alt="" src={obsidianLogo} className={cn('object-contain', mark)} />
      ) : provider === 'ndp' ? (
        <>
          <img alt="" src={ndpLight} className={cn('object-contain dark:hidden', wordmark)} />
          <img alt="" src={ndpDark} className={cn('hidden object-contain dark:block', wordmark)} />
        </>
      ) : provider === 'sftp' ? (
        <TerminalIcon aria-hidden="true" className={glyph} />
      ) : (
        <FolderIcon aria-hidden="true" className={glyph} />
      )}
    </span>
  );
}
