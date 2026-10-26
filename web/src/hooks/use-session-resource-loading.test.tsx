import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useSessionResourceLoading } from './use-session-resource-loading';
afterEach(cleanup);

it('waits for the log and a paint, then re-gates on session identity changes', async () => {
  const view = renderHook(({ id, ready }) => useSessionResourceLoading(id, ready), {
    initialProps: { id: 'a', ready: false },
  });
  expect(view.result.current.enabled).toBe(false);
  view.rerender({ id: 'a', ready: true });
  expect(view.result.current.enabled).toBe(false);
  await waitFor(() => expect(view.result.current.enabled).toBe(true));
  view.rerender({ id: 'b', ready: true });
  expect(view.result.current.enabled).toBe(false);
  await waitFor(() => expect(view.result.current.enabled).toBe(true));
});
