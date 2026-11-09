import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProfileSettings } from './settings-profile';
import { PROFILE_STORAGE_KEY } from './settings-profile-store';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('ProfileSettings', () => {
  it('saves typed details only on this computer through the save bar', () => {
    render(<ProfileSettings />);
    expect(screen.getByText('Stays local. Saved only on this computer.')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'Optional');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Jaime ' } });
    fireEvent.change(screen.getByLabelText('About you'), {
      target: { value: 'Hydrologist. I work on soil moisture.' },
    });
    expect(screen.getByLabelText('Unsaved changes')).toHaveTextContent('2');

    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? '{}')).toEqual({
      name: 'Jaime',
      email: '',
      about: 'Hydrologist. I work on soil moisture.',
    });
    expect(screen.queryByLabelText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Jaime');
  });

  it('holds an invalid email back and discards edits', () => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ name: 'Ana', email: 'ana@example.org', about: '' }),
    );
    render(<ProfileSettings />);
    expect(screen.getByLabelText('Name')).toHaveValue('Ana');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an email address.');
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^Discard/ }));
    expect(screen.getByLabelText('Email')).toHaveValue('ana@example.org');
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? '{}').email).toBe(
      'ana@example.org',
    );
  });
});
