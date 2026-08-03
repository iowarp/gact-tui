import { createSignal } from 'solid-js';
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DensityChoices,
  IntroSplashControls,
  LocaleChoices,
  PreferenceResetControls,
} from '../../src/routes/SettingsAppearanceSections.js';
import type { LocaleTag } from '../../src/locale.js';

afterEach(cleanup);

describe('SettingsAppearanceSections', () => {
  it('renders locale choices and resets to English', () => {
    const [locale, setLocale] = createSignal<LocaleTag>('es');
    const onChangeLocale = vi.fn((next: LocaleTag) => setLocale(next));
    render(() => <LocaleChoices locale={locale} onChangeLocale={onChangeLocale} />);

    expect(screen.getByTestId('settings-locale-es').classList.contains('is-active')).toBe(true);

    fireEvent.click(screen.getByTestId('settings-locale-reset'));
    expect(onChangeLocale).toHaveBeenCalledWith('en');
    expect(screen.getByTestId('settings-locale-en').classList.contains('is-active')).toBe(true);
  });

  it('emits density changes', () => {
    const [density, setDensity] = createSignal<'verbose' | 'normal' | 'summary'>('normal');
    const onChangeDensity = vi.fn((next: 'verbose' | 'normal' | 'summary') => setDensity(next));
    render(() => <DensityChoices density={density} onChangeDensity={onChangeDensity} />);

    fireEvent.click(screen.getByTestId('settings-density-summary'));
    expect(onChangeDensity).toHaveBeenCalledWith('summary');
    expect(screen.getByTestId('settings-density-summary').classList.contains('is-active')).toBe(
      true,
    );
  });

  it('updates and clears intro text', () => {
    const [intro, setIntro] = createSignal('hello');
    const onChangeIntro = vi.fn((next: string) => setIntro(next));
    render(() => <IntroSplashControls intro={intro} onChangeIntro={onChangeIntro} />);

    fireEvent.input(screen.getByTestId('settings-intro-textarea'), {
      target: { value: 'new intro' },
    });
    expect(onChangeIntro).toHaveBeenCalledWith('new intro');

    fireEvent.click(screen.getByTestId('settings-intro-clear'));
    expect(onChangeIntro).toHaveBeenCalledWith('');
  });

  it('delegates preference reset confirmation to the owner', () => {
    const onResetPreferences = vi.fn();
    render(() => <PreferenceResetControls onResetPreferences={onResetPreferences} />);

    fireEvent.click(screen.getByTestId('settings-reset-prefs'));
    expect(onResetPreferences).toHaveBeenCalledOnce();
  });
});
