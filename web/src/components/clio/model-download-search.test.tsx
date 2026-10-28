import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModelDownloadSearch } from './model-download-search';

afterEach(cleanup);

it('filters Hub results with the shared task chips without inventing serving capabilities', async () => {
  const selected = vi.fn();
  const search = vi.fn();
  function Review() {
    const [query, setQuery] = useState('');
    return (
      <ModelDownloadSearch
        query={query}
        onQuery={setQuery}
        onSearch={search}
        selected=""
        onSelect={selected}
        searching={false}
        models={[
          {
            repository: 'org/chat',
            task: 'text-generation',
            revision: 'abc',
            gated: false,
            downloads: 4,
          },
          {
            repository: 'org/image',
            task: 'text-to-image',
            revision: 'def',
            gated: true,
            downloads: 2,
          },
        ]}
      />
    );
  }
  render(<Review />);
  const user = userEvent.setup();
  const results = screen.getByLabelText('Model search results');
  expect(within(results).getAllByRole('button')).toHaveLength(2);
  await user.click(screen.getByLabelText('Find on Hugging Face'));
  await user.click(
    within(screen.getByRole('region', { name: 'Filter models' })).getByRole('button', {
      name: /Text generation/iu,
    }),
  );
  expect(within(results).getAllByRole('button')).toHaveLength(1);
  expect(screen.getByLabelText('1 of 2 loaded results match')).toBeVisible();
  expect(within(results).queryByText('org/image')).not.toBeInTheDocument();
  expect(screen.queryByText('Tools')).not.toBeInTheDocument();
  await user.click(within(results).getByRole('button', { name: /org\/chat/u }));
  expect(selected).toHaveBeenCalledWith(
    expect.objectContaining({ repository: 'org/chat', revision: 'abc' }),
  );
  expect(search).not.toHaveBeenCalled();
  await user.click(screen.getByLabelText('Find on Hugging Face'));
  expect(screen.queryByRole('tab', { name: 'Capabilities' })).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('region', { name: 'Filter models' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remove task:text-generation' }));
  expect(within(results).getAllByRole('button')).toHaveLength(2);
  await user.type(screen.getByLabelText('Find on Hugging Face'), 'Nemotron{Enter}');
  expect(search).toHaveBeenCalledOnce();
});
