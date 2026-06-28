import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_MODE_KEY, THEME_TOKENS_KEY } from '../../src/theme.js';
import { AppearanceSection } from '../../src/routes/SettingsAppearance.js';

beforeEach(() => {
  localStorage.clear();
  document.getElementById('clio-theme-override')?.remove();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.getElementById('clio-theme-override')?.remove();
});

describe('AppearanceSection', () => {
  it('updates theme mode and accent token overrides', () => {
    render(() => <AppearanceSection />);

    fireEvent.click(screen.getByTestId('settings-theme-light'));
    expect(localStorage.getItem(THEME_MODE_KEY)).toBe('light');

    fireEvent.input(screen.getByTestId('theme-token---color-accent'), {
      target: { value: '#ff0000' },
    });

    expect(localStorage.getItem(THEME_TOKENS_KEY)).toContain('#ff0000');
    expect(screen.getByText('#ff0000')).toBeTruthy();

    fireEvent.click(screen.getByTestId('theme-tokens-reset-all'));
    expect(localStorage.getItem(THEME_TOKENS_KEY)).toBeNull();
  });
});
