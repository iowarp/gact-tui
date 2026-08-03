import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { PermissionCard } from '../../src/components/PermissionCard.js';

afterEach(cleanup);

describe('PermissionCard', () => {
  it('shows the tool name and inputs', () => {
    render(() => (
      <PermissionCard
        request={{
          id: 'p1',
          session_id: 's1',
          tool_name: 'WriteFile',
          risk: 'high',
          created_at: '2026-05-27T00:00:00Z',
          tool_call: { input: { path: 'x.go' } },
        }}
      />
    ));
    expect(screen.getByTestId('permission-card')).toBeTruthy();
    expect(screen.getByTestId('permission-card').textContent).toContain('WriteFile');
    expect(screen.getByTestId('permission-card').textContent).toContain('x.go');
  });
});
