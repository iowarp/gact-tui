import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { TodoList } from './todo-list';

const todos = [
  { content: 'Earlier work', status: 'completed' },
  { content: 'Investigate', status: 'in_progress' },
  { content: 'Review', status: 'pending' },
];
function List({ items = todos }: { items?: typeof todos }) {
  return (
    <TodoList
      items={items}
      status={(todo) => todo.status}
      scope="transcript"
      summary
      renderItem={(todo) => <li key={todo.content}>{todo.content}</li>}
    />
  );
}
beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
});
afterEach(cleanup);

it('focuses current work, preserves explicit completed expansion on remount, and updates counts', async () => {
  const user = userEvent.setup();
  const first = render(<List />);
  expect(screen.getByText('1 of 3 done')).toBeVisible();
  expect(
    within(screen.getByRole('list', { name: 'Current todos' })).getAllByRole('listitem'),
  ).toHaveLength(2);
  expect(screen.queryByText('Earlier work')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Show completed 1' }));
  expect(screen.getByText('Earlier work')).toBeVisible();
  first.unmount();
  const second = render(<List />);
  expect(screen.getByText('Earlier work')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Hide completed 1' }));
  second.rerender(<List items={todos.map((todo) => ({ ...todo, status: 'completed' }))} />);
  expect(screen.getByText('3 of 3 done')).toBeVisible();
  expect(screen.queryByText('No current todos.')).not.toBeInTheDocument();
  expect(screen.queryByText('Investigate')).not.toBeInTheDocument();
});
