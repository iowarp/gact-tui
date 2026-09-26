import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandTagline } from './brand-tagline';

const opener = vi.hoisted(() => ({ openExternalUrl: vi.fn(async () => undefined) }));
vi.mock('@/tauri/external-url', () => opener);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const byline = {
  tagline: 'by the Example Institute',
  taglineAccent: 'Example Institute',
  taglineAccentUrl: 'https://example.org',
};

describe('BrandTagline', () => {
  it("links the accent to the brand's organization URL", () => {
    render(<BrandTagline brand={byline} />);

    const link = screen.getByRole('link', { name: 'Example Institute' });
    expect(link).toHaveAttribute('href', 'https://example.org');
    expect(link.closest('p')).toHaveTextContent('by the Example Institute');
  });

  it('opens the organization through the external-link opener', async () => {
    const user = userEvent.setup();
    render(<BrandTagline brand={byline} />);

    await user.click(screen.getByRole('link', { name: 'Example Institute' }));

    expect(opener.openExternalUrl).toHaveBeenCalledWith('https://example.org');
  });

  it('renders plain text when the brand names no organization URL', () => {
    render(<BrandTagline brand={{ ...byline, taglineAccentUrl: null }} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('by the Example Institute')).toBeVisible();
  });

  it('renders plain text when the accent is not part of the tagline', () => {
    render(<BrandTagline brand={{ ...byline, taglineAccent: 'Elsewhere' }} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing for a brand with no tagline', () => {
    const { container } = render(<BrandTagline brand={{ ...byline, tagline: '' }} />);

    expect(container).toBeEmptyDOMElement();
  });
});
