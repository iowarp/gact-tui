/**
 * gact-tui#366: settings/pages/common.tsx's shared LoadingNote — consumed by
 * BlueprintsPage, CatalogPages, DoctorPage, ExpertPacksPage, and others while
 * their backing read is in flight — rendered a bare "Loading…" paragraph.
 * Now renders the shared kit Skeleton primitive.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingNote } from '../../src/settings/pages/common';

describe('LoadingNote (gact-tui#366)', () => {
  it('renders the Skeleton primitive, not a bare paragraph', () => {
    render(<LoadingNote />);
    const skeleton = screen.getByTestId('kit-skeleton');
    expect(skeleton).toHaveAttribute('role', 'status');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton).toHaveAccessibleName('Loading…');
  });
});
