/**
 * Contract for the last two kit primitives: Select and MasterDetail.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MasterDetail, Select } from '../../src/kit';

describe('Select', () => {
  const OPTIONS = [
    { id: 'sonnet', label: 'claude-sonnet-5' },
    { id: 'opus', label: 'claude-opus-5' },
    { id: 'gpt', label: 'gpt-5.5', disabled: true },
  ];

  function Harness({ onChange }: { onChange?: (id: string) => void }) {
    const [value, setValue] = useState('sonnet');
    return (
      <Select
        label="Model"
        value={value}
        options={OPTIONS}
        onChange={(id) => {
          setValue(id);
          onChange?.(id);
        }}
      />
    );
  }

  it('exposes a labelled combobox showing the current selection', () => {
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Model' });
    expect(trigger).toHaveTextContent('claude-sonnet-5');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a listbox and marks the selected option', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }));
    const list = screen.getByRole('listbox');
    expect(within(list).getByRole('option', { selected: true })).toHaveTextContent(
      'claude-sonnet-5',
    );
  });

  it('selects an option and closes', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'claude-opus-5' }));
    expect(onChange).toHaveBeenCalledWith('opus');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveTextContent('claude-opus-5');
  });

  it('never selects a disabled option', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'gpt-5.5' }));
    expect(onChange).not.toHaveBeenCalled();
    // Still open: a rejected click must not look like a successful choice.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Model' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('MasterDetail', () => {
  const PAGES = [
    { id: 'providers', label: 'Providers' },
    { id: 'policies', label: 'Policies' },
    { id: 'hooks', label: 'Hooks' },
  ];

  function Harness() {
    const [active, setActive] = useState('providers');
    return (
      <MasterDetail
        label="Settings"
        items={PAGES}
        activeId={active}
        onSelect={setActive}
        detail={<p>detail for {active}</p>}
      />
    );
  }

  it('is a labelled navigation list with one current item', () => {
    render(<Harness />);
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getByRole('button', { current: 'page' })).toHaveTextContent('Providers');
  });

  it('switches the detail pane', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Policies' }));
    expect(screen.getByText('detail for policies')).toBeInTheDocument();
  });

  it('hides unbacked pages rather than rendering dead entries', () => {
    // Settings pages with no backing route ship hidden (#337) — the kit must
    // support that without each surface filtering by hand.
    render(
      <MasterDetail
        label="Settings"
        items={[
          { id: 'providers', label: 'Providers' },
          { id: 'plugins', label: 'Plugins', hidden: true },
        ]}
        activeId="providers"
        onSelect={() => {}}
        detail={null}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Plugins' })).toBeNull();
  });
});
