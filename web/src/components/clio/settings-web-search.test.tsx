import { searchSettingsSchema, TransportError, type SearchSettings } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PROFILE_STORAGE_KEY } from './settings-profile-store';
import { WebSearchSettings } from './settings-web-search';

const repository = vi.hoisted(() => ({
  searchSettings: vi.fn(),
  updateSearchSettings: vi.fn(),
  saveSearchSourceKey: vi.fn(),
  removeSearchSourceKey: vi.fn(),
  requestOpenAlexKey: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://test' } }),
}));

const NOW = 1_790_000_000;
const row = (id: string, name: string, fields: Record<string, unknown> = {}) => ({
  id,
  name,
  description: `${name} search.`,
  free_use: '',
  key_page: `https://${id}.example/keys`,
  key_benefit: 'A private allowance.',
  ...fields,
});

function view(overrides: Partial<SearchSettings> = {}): SearchSettings {
  return searchSettingsSchema.parse({
    enabled: true,
    auto_switch: true,
    service_url: '',
    contact_email: 'ada@example.org',
    literature_approved: true,
    web: [
      row('keenable', 'Keenable', {
        position: 0,
        approved: true,
        free_use: '1,000 searches per hour',
        answered_today: 4,
        failed_today: 1,
      }),
      row('exa', 'Exa', {
        position: 1,
        approved: false,
        limited_until: NOW + 3600,
        limited_kind: 'allowance_used',
      }),
      row('you', 'You.com', { position: 2, approved: true, enabled: false }),
    ],
    literature: [
      row('openalex', 'OpenAlex'),
      row('semantic_scholar', 'Semantic Scholar', { key_required: true }),
    ],
    ...overrides,
  });
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <WebSearchSettings />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/** Profile details live in this browser, like the Profile page saves them. */
const setProfileEmail = (email: string) =>
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ name: 'Ada', email, about: '' }));

async function openTab(name: 'Web' | 'Literature') {
  const tab = await screen.findByRole('radio', { name });
  await userEvent.click(tab);
  expect(tab).toHaveAttribute('aria-checked', 'true');
  return screen.getByRole('region', { name });
}

const webList = () =>
  screen.findByRole('list', { name: 'Web sources, in the order they are tried' });

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
  repository.searchSettings.mockResolvedValue(view());
  repository.updateSearchSettings.mockImplementation(async (change) => {
    const current = view();
    const order: string[] = change.web_order ?? current.web.map((source) => source.id);
    return view({
      ...change,
      web: order.map((id, position) => ({
        ...current.web.find((source) => source.id === id)!,
        position,
      })),
    });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it('lists each source with its state, mode, use today and free allowance in words', async () => {
  renderSection();
  const list = await webList();
  const items = within(list).getAllByRole('listitem');
  expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
    'Keenable',
    'Exa',
    'You.com',
  ]);
  const keenable = within(list).getByRole('listitem', { name: 'Keenable' });
  expect(within(keenable).getByText('Approved')).toBeVisible();
  expect(within(keenable).getByText('Free, no key')).toBeVisible();
  expect(within(keenable).getByText('Today on this computer: 4 searches, 1 failed')).toBeVisible();
  expect(within(keenable).getByText('Free use: 1,000 searches per hour')).toBeVisible();
  const exa = within(list).getByRole('listitem', { name: 'Exa' });
  expect(within(exa).getByText(/^Allowance used up until /u)).toBeVisible();
  expect(within(exa).queryByText(/Today on this computer/u)).not.toBeInTheDocument();
  expect(within(list).getByRole('listitem', { name: 'You.com' })).toHaveTextContent('Off');
  expect(screen.getByRole('radio', { name: 'Web' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.queryByRole('list', { name: 'Papers & datasets sources' })).not.toBeInTheDocument();
  const literature = await openTab('Literature');
  expect(within(literature).queryByRole('switch', { name: 'Web search' })).not.toBeInTheDocument();
  const papers = within(literature).getByRole('list', { name: 'Papers & datasets sources' });
  expect(within(papers).getByRole('listitem', { name: 'OpenAlex' })).toHaveTextContent('Ready');
  expect(within(papers).getByRole('listitem', { name: 'Semantic Scholar' })).toHaveTextContent(
    'Needs your key',
  );
  // Scholarly sources are searched together, so they never move.
  expect(within(papers).queryByRole('button', { name: /Move .* up/u })).not.toBeInTheDocument();
});

it('reorders with Move down and saves the new order', async () => {
  const user = userEvent.setup();
  renderSection();
  const list = await webList();
  expect(within(list).getByRole('button', { name: 'Move Keenable up' })).toBeDisabled();
  await user.click(within(list).getByRole('button', { name: 'Move Keenable down' }));
  expect(repository.updateSearchSettings).toHaveBeenCalledWith({
    web_order: ['exa', 'keenable', 'you'],
  });
  await waitFor(() =>
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['Exa', 'Keenable', 'You.com']),
  );
});

it('shows a refused change beside its list and restores the order', async () => {
  const user = userEvent.setup();
  repository.updateSearchSettings.mockRejectedValueOnce(
    new TransportError('web_order names an unknown source', 422),
  );
  renderSection();
  const list = await webList();
  await user.click(within(list).getByRole('button', { name: 'Move Exa up' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('web_order names an unknown source');
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((item) => item.getAttribute('aria-label')),
  ).toEqual(['Keenable', 'Exa', 'You.com']);
});

it('turns sources and the automatic switch on and off', async () => {
  const user = userEvent.setup();
  renderSection();
  await webList();
  await user.click(screen.getByRole('switch', { name: 'Use You.com' }));
  expect(repository.updateSearchSettings).toHaveBeenLastCalledWith({ web_disabled: [] });
  await user.click(
    screen.getByRole('switch', {
      name: 'Switch sources automatically',
    }),
  );
  expect(repository.updateSearchSettings).toHaveBeenLastCalledWith({ auto_switch: false });
  await user.click(screen.getByRole('switch', { name: 'Web search' }));
  expect(repository.updateSearchSettings).toHaveBeenLastCalledWith({ enabled: false });
  await openTab('Literature');
  await user.click(screen.getByRole('switch', { name: 'Use OpenAlex' }));
  expect(repository.updateSearchSettings).toHaveBeenLastCalledWith({
    literature_disabled: ['openalex'],
  });
});

it('saves a key without showing it again, says the source is tried first, and undoes the move', async () => {
  const user = userEvent.setup();
  const keyed = view();
  keyed.web = [keyed.web[1]!, keyed.web[0]!, keyed.web[2]!].map((source, position) => ({
    ...source,
    position,
    has_key: source.id === 'exa',
  }));
  repository.saveSearchSourceKey.mockResolvedValue({ source: 'exa', saved: true, settings: keyed });
  renderSection();
  const list = await webList();
  await user.click(within(list).getByRole('button', { name: 'Add your Exa key' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add your Exa key' });
  expect(within(dialog).getByRole('link', { name: 'Get a key' })).toHaveAttribute(
    'href',
    'https://exa.example/keys',
  );
  const field = within(dialog).getByLabelText('Key');
  expect(field).toHaveAttribute('type', 'password');
  await user.type(field, 'exa-secret-123');
  await user.click(within(dialog).getByRole('button', { name: 'Save key' }));
  expect(repository.saveSearchSourceKey).toHaveBeenCalledWith('exa', 'exa-secret-123');
  const notice = (await screen.findByText('Exa is now tried first.')).closest(
    '[role="status"]',
  ) as HTMLElement;
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('exa-secret-123');
  expect(within(list).getByRole('listitem', { name: 'Exa' })).toHaveTextContent('Your key');
  await user.click(within(notice).getByRole('button', { name: 'Undo' }));
  expect(repository.updateSearchSettings).toHaveBeenLastCalledWith({
    web_order: ['keenable', 'exa', 'you'],
  });
  await waitFor(() =>
    expect(screen.queryByText('Exa is now tried first.')).not.toBeInTheDocument(),
  );
});

it('keeps the dialog open with the server’s reason when a key is refused', async () => {
  const user = userEvent.setup();
  repository.saveSearchSourceKey.mockRejectedValue(new TransportError('api_key is required', 422));
  renderSection();
  const list = await webList();
  await user.click(within(list).getByRole('button', { name: 'Add your Keenable key' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add your Keenable key' });
  await user.type(within(dialog).getByLabelText('Key'), 'x');
  await user.click(within(dialog).getByRole('button', { name: 'Save key' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('api_key is required');
});

it('asks OpenAlex for a free key by email and shows its answer', async () => {
  const user = userEvent.setup();
  repository.requestOpenAlexKey.mockResolvedValue({
    saved: true,
    status: 'pending',
    message: 'Check your email and click the activation link',
  });
  setProfileEmail('ada.lovelace@example.org');
  renderSection();
  await webList();
  await openTab('Literature');
  const papers = screen.getByRole('list', { name: 'Papers & datasets sources' });
  const openalex = within(papers).getByRole('listitem', { name: 'OpenAlex' });
  await user.click(within(openalex).getByRole('button', { name: 'Get a free OpenAlex key' }));
  const email = within(openalex).getByLabelText(/Your email address/u);
  expect(email).toHaveValue('ada.lovelace@example.org');
  await user.clear(email);
  await user.type(email, 'grace@example.org');
  await user.click(within(openalex).getByRole('button', { name: 'Request key' }));
  expect(repository.requestOpenAlexKey).toHaveBeenCalledWith('grace@example.org');
  expect(await within(openalex).findByRole('status')).toHaveTextContent(
    'Check your email and click the activation link',
  );
});

it('saves the service address and contact email, and shows a refusal beside the field', async () => {
  const user = userEvent.setup();
  renderSection();
  await webList();
  const address = screen.getByLabelText('Search service address');
  await user.type(address, 'not a url');
  repository.updateSearchSettings.mockRejectedValueOnce(
    new TransportError('service_url must be an http(s) address', 422),
  );
  const addressRow = address.closest('[data-slot="settings-row"]') as HTMLElement;
  await user.click(within(addressRow).getByRole('button', { name: 'Save' }));
  expect(await within(addressRow).findByRole('alert')).toHaveTextContent(
    'service_url must be an http(s) address',
  );
});

it('shares the profile email as the contact when the service holds none', async () => {
  setProfileEmail('ada@example.org');
  repository.searchSettings.mockResolvedValue(view({ contact_email: '' }));
  renderSection();
  await webList();
  await waitFor(() =>
    expect(repository.updateSearchSettings).toHaveBeenCalledWith({
      contact_email: 'ada@example.org',
    }),
  );
  const literature = await openTab('Literature');
  expect(
    within(literature).getByRole('checkbox', { name: 'Use my profile email (ada@example.org)' }),
  ).toBeChecked();
  expect(within(literature).queryByRole('textbox', { name: /contact email/iu })).toBeNull();
});

it('unticks the profile email to share none, then saves a different address', async () => {
  const user = userEvent.setup();
  setProfileEmail('ada@example.org');
  renderSection();
  await webList();
  const literature = await openTab('Literature');
  const box = within(literature).getByRole('checkbox', {
    name: 'Use my profile email (ada@example.org)',
  });
  expect(box).toBeChecked();
  expect(repository.updateSearchSettings).not.toHaveBeenCalled();
  await user.click(box);
  expect(repository.updateSearchSettings).toHaveBeenLastCalledWith({ contact_email: '' });
  const other = await within(literature).findByLabelText('Another contact email (optional)');
  expect(other).toHaveValue('');
  await user.type(other, 'lab@example.org{Enter}');
  expect(repository.updateSearchSettings).toHaveBeenLastCalledWith({
    contact_email: 'lab@example.org',
  });
  // Reopening keeps the person's choice instead of sharing the profile email again.
  cleanup();
  repository.searchSettings.mockResolvedValue(view({ contact_email: '' }));
  repository.updateSearchSettings.mockClear();
  renderSection();
  await webList();
  await openTab('Literature');
  expect(screen.getByRole('checkbox', { name: /Use my profile email/u })).not.toBeChecked();
  expect(repository.updateSearchSettings).not.toHaveBeenCalled();
});

it('keeps a different saved address unticked, and without a profile email offers the field', async () => {
  setProfileEmail('ada@example.org');
  repository.searchSettings.mockResolvedValue(view({ contact_email: 'lab@example.org' }));
  renderSection();
  await webList();
  let literature = await openTab('Literature');
  expect(
    within(literature).getByRole('checkbox', { name: /Use my profile email/u }),
  ).not.toBeChecked();
  expect(within(literature).getByLabelText('Another contact email (optional)')).toHaveValue(
    'lab@example.org',
  );
  cleanup();
  localStorage.clear();
  renderSection();
  await webList();
  literature = await openTab('Literature');
  expect(within(literature).queryByRole('checkbox')).toBeNull();
  expect(
    within(literature).getByLabelText('Contact email for Crossref and OpenAlex (optional)'),
  ).toHaveValue('lab@example.org');
  expect(within(literature).getByRole('link', { name: 'Add an email in Profile' })).toHaveAttribute(
    'href',
    '/settings/profile',
  );
  expect(repository.updateSearchSettings).not.toHaveBeenCalled();
});

it('says when the service has no search settings, and offers a retry on failure', async () => {
  repository.searchSettings.mockRejectedValueOnce(new TransportError('Not Found', 404));
  renderSection();
  expect(await screen.findByText('This service doesn’t offer web search settings.')).toBeVisible();
  cleanup();
  repository.searchSettings.mockRejectedValueOnce(new TransportError('boom', 500));
  renderSection();
  const retry = await screen.findByRole('button', { name: 'Retry' });
  await userEvent.click(retry);
  expect(await webList()).toBeVisible();
});
