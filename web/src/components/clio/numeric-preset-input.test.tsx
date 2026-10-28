import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { NumericPresetInput } from './numeric-preset-input';

afterEach(cleanup);

it('shows one named preset control and switches to a focused custom editor', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const options = [
    { value: 0, label: 'Never' },
    { value: 30, label: '30 days' },
    { value: 60, label: '60 days' },
  ];
  const { rerender } = render(
    <NumericPresetInput
      id="expiry"
      label="Memory expiry"
      value="30"
      presets={options}
      minimum={0}
      step={1}
      unit="days"
      onChange={onChange}
    />,
  );

  const preset = screen.getByRole('combobox', { name: 'Choose memory expiry preset' });
  expect(preset).toHaveTextContent('30 days');
  expect(screen.queryByRole('spinbutton', { name: 'Memory expiry' })).not.toBeInTheDocument();
  await user.click(preset);
  await user.click(await screen.findByRole('option', { name: 'Never' }));
  expect(onChange).toHaveBeenLastCalledWith('0');

  rerender(
    <NumericPresetInput
      id="expiry"
      label="Memory expiry"
      value="0"
      presets={options}
      minimum={0}
      step={1}
      unit="days"
      onChange={onChange}
    />,
  );
  expect(screen.getByRole('combobox', { name: 'Choose memory expiry preset' })).toHaveTextContent(
    'Never',
  );
  expect(screen.queryByRole('spinbutton', { name: 'Memory expiry' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('combobox', { name: 'Choose memory expiry preset' }));
  await user.click(await screen.findByRole('option', { name: 'Custom…' }));
  const input = screen.getByRole('spinbutton', { name: 'Memory expiry' });
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.change(input, { target: { value: '90' } });
  expect(onChange).toHaveBeenLastCalledWith('90');

  await user.click(screen.getByRole('combobox', { name: 'Choose memory expiry preset' }));
  await user.click(await screen.findByRole('option', { name: '60 days' }));
  expect(onChange).toHaveBeenLastCalledWith('60');
});

it('keeps the full long zero-preset label visible within the control width', () => {
  render(
    <NumericPresetInput
      id="idle"
      label="Idle minutes"
      value="0"
      presets={[
        { value: 0, label: 'After each completed turn' },
        { value: 5, label: '5 minutes' },
      ]}
      minimum={0}
      step={1}
      onChange={vi.fn()}
    />,
  );

  const picker = screen.getByRole('combobox', { name: 'Choose idle minutes preset' });
  expect(picker).toHaveTextContent('After each completed turn');
  expect(picker).toHaveClass('max-w-72');
});

it('does not focus a custom saved value when the control first mounts', () => {
  render(
    <NumericPresetInput
      id="expiry"
      label="Memory expiry"
      value="45"
      presets={[
        { value: 0, label: 'Never' },
        { value: 30, label: '30 days' },
      ]}
      minimum={0}
      step={1}
      onChange={vi.fn()}
    />,
  );

  expect(screen.getByRole('spinbutton', { name: 'Memory expiry' })).not.toHaveFocus();
});

it('disables the selected preset control and custom editor when requested', () => {
  const { rerender } = render(
    <NumericPresetInput
      id="idle"
      label="Idle minutes"
      value="0"
      presets={[{ value: 0, label: 'After each completed turn' }]}
      minimum={0}
      step={1}
      disabled
      onChange={vi.fn()}
    />,
  );

  expect(screen.getByRole('combobox', { name: 'Choose idle minutes preset' })).toBeDisabled();
  rerender(
    <NumericPresetInput
      id="idle"
      label="Idle minutes"
      value="7"
      presets={[{ value: 0, label: 'After each completed turn' }]}
      minimum={0}
      step={1}
      disabled
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByRole('spinbutton', { name: 'Idle minutes' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Choose idle minutes preset' })).toBeDisabled();
});

it('returns to the saved preset after an external reload without replacing custom typing', async () => {
  const user = userEvent.setup();
  const props = {
    id: 'idle',
    label: 'Create memories',
    presets: [{ value: 30, label: '30 minutes' }],
    minimum: 0,
    step: 1,
    onChange: vi.fn(),
  };
  const { rerender } = render(<NumericPresetInput {...props} value="30" />);
  await user.click(screen.getByRole('combobox', { name: 'Choose create memories preset' }));
  await user.click(await screen.findByRole('option', { name: 'Custom…' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Create memories' }), {
    target: { value: '37' },
  });
  rerender(<NumericPresetInput {...props} value="37" />);
  expect(screen.getByRole('spinbutton', { name: 'Create memories' })).toHaveValue(37);
  rerender(<NumericPresetInput {...props} value="30" />);
  await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument());
  expect(screen.getByRole('combobox', { name: 'Choose create memories preset' })).toHaveTextContent(
    '30 minutes',
  );
});
