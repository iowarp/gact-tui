import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { SettingsChoice, SettingsRow } from './settings-row';
afterEach(cleanup);
it('supports labelled choices, mouse selection and arrow-key navigation', async () => {
  function Preference() {
    const [value, setValue] = useState('light');
    return (
      <SettingsRow title="Theme" description="Choose a palette.">
        <SettingsChoice
          id="theme"
          label="Theme"
          value={value}
          onChange={setValue}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </SettingsRow>
    );
  }
  const user = userEvent.setup();
  render(<Preference />);
  await user.click(screen.getByText('Dark'));
  expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await user.keyboard('{ArrowLeft}');
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked());
});
