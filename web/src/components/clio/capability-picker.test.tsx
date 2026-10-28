import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { CapabilityPicker, CapabilitySelection, type CapabilityOption } from './capability-picker';
import { MemoryRouter, Link, useLocation } from 'react-router-dom';

afterEach(cleanup);

const items: CapabilityOption[] = [
  {
    id: 'ha/skills',
    title: 'Home Assistant',
    source: 'ha',
    description: 'Device configuration guidance',
    group: 'Plugins',
    icon: null,
    keywords: ['automations'],
  },
  { id: 'science/data', title: 'Scientific data', source: 'science', group: 'Plugins', icon: null },
];

it('lets a footer link navigate before dismissing the popup', async () => {
  function Harness() {
    const location = useLocation();
    return (
      <>
        <output>{location.pathname}</output>
        <CapabilityPicker
          items={items}
          onChoose={() => {}}
          footer={<Link to="/settings/plugins">Browse extensions</Link>}
        >
          <button>Open picker</button>
        </CapabilityPicker>
      </>
    );
  }
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Open picker' }));
  await user.click(screen.getByRole('link', { name: 'Browse extensions' }));
  expect(screen.getByRole('status')).toHaveTextContent('/settings/plugins');
  expect(screen.queryByRole('link', { name: 'Browse extensions' })).not.toBeInTheDocument();
});

it('searches capability contents, adds one choice and lets it be removed without rendering the whole catalog when closed', async () => {
  function Harness() {
    const [values, setValues] = useState<string[]>([]);
    return (
      <CapabilitySelection label="Plugins" items={items} values={values} onChange={setValues} />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Choose plugins' }));
  await user.type(screen.getByRole('combobox', { name: 'Search plugins' }), 'automations');
  expect(screen.getByRole('option', { name: /Home Assistant/ })).toBeVisible();
  expect(screen.queryByRole('option', { name: /Scientific data/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('option', { name: /Home Assistant/ }));
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remove Home Assistant' }));
  expect(screen.queryByText('Home Assistant')).not.toBeInTheDocument();
});
