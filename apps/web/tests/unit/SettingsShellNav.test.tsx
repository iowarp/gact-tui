import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsShellNav, groupSettingsSections } from '../../src/routes/SettingsShellNav.js';
import type { SectionDef } from '../../src/routes/settingsSections.js';

afterEach(cleanup);

describe('groupSettingsSections', () => {
  it('groups sections by declaration order without re-sorting', () => {
    const sections: SectionDef[] = [
      { id: 'backends', label: 'Backends', icon: 'mcp', group: 'Connection' },
      { id: 'models', label: 'Models', icon: 'sparkle', group: 'Agents' },
      { id: 'providers', label: 'Providers', icon: 'plug', group: 'Agents' },
      { id: 'about', label: 'About', icon: 'help', group: 'App' },
    ];

    expect(groupSettingsSections(sections)).toEqual([
      { group: 'Connection', items: [sections[0]] },
      { group: 'Agents', items: [sections[1], sections[2]] },
      { group: 'App', items: [sections[3]] },
    ]);
  });
});

describe('SettingsShellNav', () => {
  it('marks the active section and emits picks', () => {
    const onPickSection = vi.fn();
    render(() => <SettingsShellNav activeSection="appearance" onPickSection={onPickSection} />);

    expect(screen.getByTestId('settings-nav-appearance').classList.contains('is-active')).toBe(
      true,
    );

    fireEvent.click(screen.getByTestId('settings-nav-about'));
    expect(onPickSection).toHaveBeenCalledWith('about');
  });
});
