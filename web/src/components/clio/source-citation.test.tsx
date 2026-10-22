import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SourceCitation } from './source-citation';

afterEach(cleanup);

describe('SourceCitation', () => {
  it('lets a long cited URL wrap instead of widening the text it sits in', () => {
    const href = 'https://manpages.debian.org/testing/lustre-client-utils/lfs-setstripe.1.en.html';
    render(
      <SourceCitation description="" detail={href} href={href} title="lfs-setstripe">
        <a href={href}>{href}</a>
      </SourceCitation>,
    );
    // A URL has no spaces to break at; without this a phone-width answer scrolls sideways.
    expect(screen.getByRole('link', { name: href })).toHaveClass('[overflow-wrap:anywhere]');
  });
});
