import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalLink } from '@/components/ui/external-link';
import { MarkdownContentLink } from './markdown-content-link';
import { PresentationNavigation } from './presentation-navigation';
import { SourceCitation } from './source-citation';

const mocks = vi.hoisted(() => ({ inTauri: false, openExternalUrl: vi.fn() }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => mocks.inTauri }));
vi.mock('@/tauri/external-url', () => ({ openExternalUrl: mocks.openExternalUrl }));

beforeEach(() => {
  mocks.inTauri = false;
  mocks.openExternalUrl.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('SourceCitation', () => {
  it('lets a long cited URL wrap instead of widening the text it sits in', () => {
    const href = 'https://manpages.debian.org/testing/lustre-client-utils/lfs-setstripe.1.en.html';
    render(
      <SourceCitation detail={href} href={href} title="lfs-setstripe">
        <a href={href}>{href}</a>
      </SourceCitation>,
    );
    // A URL has no spaces to break at; without this a phone-width answer scrolls sideways.
    expect(screen.getByRole('link', { name: href })).toHaveClass('[overflow-wrap:anywhere]');
  });

  it('makes the preview a native source link without redundant instructions', async () => {
    const href = 'https://docs.xarray.dev/en/stable/user-guide/pandas.html';
    render(<MarkdownContentLink href={href}>Xarray pandas guide</MarkdownContentLink>);
    await userEvent.hover(screen.getByRole('link', { name: 'Xarray pandas guide' }));
    const title = await screen.findByRole('heading', { name: 'Xarray pandas guide' });
    const preview = title.closest('a');
    expect(preview).toHaveAttribute('href', href);
    expect(preview).toHaveAttribute('target', '_blank');
    expect(preview).toContainElement(screen.getByText(href));
    expect(screen.queryByText(/Open the original/)).not.toBeInTheDocument();
  });

  it('opens the source from its preview through the desktop external-link bridge', async () => {
    mocks.inTauri = true;
    const href = 'https://example.org/source';
    render(
      <SourceCitation href={href} detail={href} title="Inspected source">
        <ExternalLink href={href}>Citation</ExternalLink>
      </SourceCitation>,
    );
    await userEvent.hover(screen.getByRole('link', { name: 'Citation' }));
    fireEvent.click(await screen.findByRole('heading', { name: 'Inspected source' }));
    expect(mocks.openExternalUrl).toHaveBeenCalledTimes(1);
    expect(mocks.openExternalUrl).toHaveBeenCalledWith(href);
  });

  it('retains workspace source routing when the preview is clicked', async () => {
    const openFile = vi.fn();
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}
      >
        <MarkdownContentLink href="workspace-file:/data/protocol.md">Protocol</MarkdownContentLink>
      </PresentationNavigation.Provider>,
    );
    await userEvent.hover(screen.getByRole('link', { name: 'Protocol' }));
    fireEvent.click(await screen.findByRole('heading', { name: 'Protocol' }));
    expect(openFile).toHaveBeenCalledTimes(1);
    expect(openFile).toHaveBeenCalledWith('/data/protocol.md');
    expect(mocks.openExternalUrl).not.toHaveBeenCalled();
  });
});
