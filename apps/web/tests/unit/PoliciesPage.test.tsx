import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@clio/core';
import { PoliciesPage } from '../../src/routes/discovery/RoadmapPages.js';

afterEach(cleanup);

function makeClient(overrides: Partial<Record<keyof Client, unknown>> = {}) {
  const policies = vi.fn().mockResolvedValue({
    policies: { tools: { shell: 'ask' } },
  });
  const putPolicies = vi.fn().mockResolvedValue({ policies: { tools: { shell: 'allow' } } });
  const client = {
    policies,
    putPolicies,
    ...overrides,
  } as unknown as Client;
  return { client, policies, putPolicies };
}

async function openEditor() {
  await waitFor(() => expect(screen.getByTestId('policies-edit')).toBeTruthy());
  fireEvent.click(screen.getByTestId('policies-edit'));
  await waitFor(() => expect(screen.getByTestId('policies-editor')).toBeTruthy());
}

describe('PoliciesPage', () => {
  it('saves a valid policy draft and refetches the policy document', async () => {
    const { client, policies, putPolicies } = makeClient();
    render(() => <PoliciesPage client={client} />);
    await openEditor();

    fireEvent.input(screen.getByTestId('policies-editor'), {
      target: { value: '{"tools":{"shell":"allow"}}' },
    });
    fireEvent.click(screen.getByTestId('policies-save'));

    await waitFor(() =>
      expect(putPolicies).toHaveBeenCalledWith({ policies: { tools: { shell: 'allow' } } }),
    );
    await waitFor(() => expect(screen.getByTestId('policies-save-result')).toBeTruthy());
    await waitFor(() => expect(policies).toHaveBeenCalledTimes(2));
  });

  it('keeps invalid drafts local and does not call the backend', async () => {
    const { client, putPolicies } = makeClient();
    render(() => <PoliciesPage client={client} />);
    await openEditor();

    fireEvent.input(screen.getByTestId('policies-editor'), {
      target: { value: '"allow"' },
    });
    fireEvent.click(screen.getByTestId('policies-save'));

    await waitFor(() =>
      expect(screen.getByText(/policies must be an object or array/i)).toBeTruthy(),
    );
    expect(putPolicies).not.toHaveBeenCalled();
  });
});
