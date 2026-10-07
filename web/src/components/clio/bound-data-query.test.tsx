import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BoundDataQuery } from './bound-data-query';
import type { TableDataQuery } from './table-query-rows';

afterEach(cleanup);

function renderSelection(value: unknown) {
  render(
    <BoundDataQuery
      dataContext={{
        resolveDynamicValue: () => value,
        subscribeDynamicValue: () => ({ unsubscribe: () => {} }),
      }}
      // This stage consumes a wire binding before producing the scalar-only
      // request accepted by the table-query repository.
      query={
        {
          filter: [{ column: 'plant', op: 'eq', value: { path: '/plant' } }],
        } as unknown as TableDataQuery
      }
    >
      {(query) => <output>{JSON.stringify(query?.filter)}</output>}
    </BoundDataQuery>,
  );
}

it('resolves the exclusive ChoicePicker array to one scalar predicate', () => {
  renderSelection(['28967']);
  expect(screen.getByRole('status')).toHaveTextContent('"value":"28967"');
});

it('refuses to silently choose a value for a multi-valued equality binding', () => {
  renderSelection(['28967', '28968']);
  expect(screen.getByRole('alert')).toHaveTextContent('no valid eq value');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
