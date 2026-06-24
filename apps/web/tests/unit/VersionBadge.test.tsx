import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { VersionBadge } from '../../src/components/VersionBadge.js';

afterEach(cleanup);

describe('VersionBadge', () => {
  it('renders the version string', () => {
    render(() => <VersionBadge version="v0.3.0-2098-g31c252e7" dirty={false} />);
    const badge = screen.getByTestId('app-version-badge');
    expect(badge.textContent).toBe('v0.3.0-2098-g31c252e7');
    expect(badge.classList.contains('app-version-badge--dirty')).toBe(false);
  });

  it('flags a dirty build with the warning modifier + tooltip', () => {
    render(() => <VersionBadge version="v0.3.0-2098-g31c252e7-dirty" dirty={true} />);
    const badge = screen.getByTestId('app-version-badge');
    expect(badge.classList.contains('app-version-badge--dirty')).toBe(true);
    expect(badge.getAttribute('title')).toMatch(/uncommitted/i);
  });
});
