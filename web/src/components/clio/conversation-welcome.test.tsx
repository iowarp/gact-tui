import { cleanup, render, screen } from '@testing-library/react';
import { brand } from '@brand';
import { afterEach, expect, it } from 'vitest';
import { ClioConversationWelcome } from './conversation-welcome';

afterEach(cleanup);

it('shows one line of welcome, its context and the composer, without starter prompts', () => {
  render(
    <ClioConversationWelcome context={<span>In opal-sites</span>}>
      <textarea aria-label="Composer" />
    </ClioConversationWelcome>,
  );
  const welcome = screen.getByRole('region', { name: `${brand.name} conversation welcome` });
  expect(screen.getByRole('heading', { level: 3, name: brand.workspace.greeting })).toBeVisible();
  expect(screen.getByText('In opal-sites')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Composer' })).toBeVisible();
  expect(screen.queryByRole('group', { name: 'Starter prompts' })).toBeNull();
  expect(welcome.querySelectorAll('p')).toHaveLength(0);
});

it('omits the context line when nothing can change', () => {
  const { container } = render(
    <ClioConversationWelcome>
      <textarea aria-label="Composer" />
    </ClioConversationWelcome>,
  );
  expect(container.querySelector('[data-slot="conversation-welcome-context"]')).toBeNull();
});
