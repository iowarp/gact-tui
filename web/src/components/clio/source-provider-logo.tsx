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

/**
 * Globus and NDP allow only their full horizontal artwork, at least 54 px wide
 * (Globus logo policy; NDP publishes no smaller mark). A list showing either one
 * widens its icon column to this width on every row, so names stay aligned.
 */
export const SOURCE_WORDMARK_WIDTH = 56;

export function sourceProviderUsesWordmark(provider: SourceProviderId): boolean {
  return provider === 'globus' || provider === 'ndp';
}

/** Original provider artwork; protocol-based sources use the shared system glyphs. */
export function SourceProviderLogo({
  provider,
  size = 'row',
}: {
  provider: SourceProviderId;
  /**
   * `icon` fits the 15px glyph slot of a list row, without a frame; Globus and
   * NDP draw their wordmark at `SOURCE_WORDMARK_WIDTH` instead.
   */
  size?: 'row' | 'detail' | 'icon';
}) {
  const detail = size === 'detail';
  const icon = size === 'icon';
  const { mark, wordmark, glyph } = {
    row: { mark: 'size-7', wordmark: 'w-14', glyph: 'size-5' },
    detail: { mark: 'size-14', wordmark: 'w-full', glyph: 'size-10' },
    icon: { mark: 'size-[15px]', wordmark: 'w-14', glyph: 'size-[15px]' },
  }[size];
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        icon
          ? sourceProviderUsesWordmark(provider)
            ? 'w-14'
            : 'size-[15px]'
          : 'rounded-md border bg-muted/20',
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
