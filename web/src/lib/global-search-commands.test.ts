import { expect, it } from 'vitest';
import { INFRASTRUCTURE_SECTIONS, settingsDestinations } from './application-destinations';
import {
  agentSearchTarget,
  globalSearchCommands,
  matchesGlobalSearch,
} from './global-search-commands';

it('indexes every canonical settings and infrastructure destination', () => {
  const commands = globalSearchCommands(false);
  for (const item of settingsDestinations(false))
    expect(commands).toContainEqual(
      expect.objectContaining({ label: item.label, action: { route: `/settings/${item.id}` } }),
    );
  for (const item of INFRASTRUCTURE_SECTIONS)
    expect(commands).toContainEqual(
      expect.objectContaining({
        label: item.label,
        action: { route: `/infrastructure/${item.id}` },
      }),
    );
  expect(new Set(commands.map((item) => item.id)).size).toBe(commands.length);
});

it('finds actions and destinations through whitespace, case and aliases', () => {
  const search = (query: string) =>
    globalSearchCommands(false).filter((item) =>
      matchesGlobalSearch(query, item.label, item.group, item.keywords),
    );
  expect(search('  DARK   mode ')).toContainEqual(
    expect.objectContaining({ action: { theme: 'dark' } }),
  );
  expect(search('protected execution')).toContainEqual(
    expect.objectContaining({ action: { route: '/infrastructure/agent' } }),
  );
  expect(search('drive')).toContainEqual(
    expect.objectContaining({ action: { route: '/settings/data-sources' } }),
  );
  expect(search('something unknown')).toEqual([]);
});

it('offers every interface language by its own name and finds it by its English name', () => {
  const search = (query: string) =>
    globalSearchCommands(false).filter((item) =>
      matchesGlobalSearch(query, item.label, item.group, item.keywords),
    );
  const languages = globalSearchCommands(false).filter((item) => 'locale' in item.action);
  expect(languages.map((item) => item.label)).toEqual(
    expect.arrayContaining(['English', 'Español', '日本語', 'Ελληνικά']),
  );
  expect(languages).toContainEqual(expect.objectContaining({ action: { locale: 'system' } }));
  expect(search('spanish')).toContainEqual(
    expect.objectContaining({ label: 'Español', lang: 'es', action: { locale: 'es' } }),
  );
  expect(search('ελλην')).toContainEqual(expect.objectContaining({ action: { locale: 'el' } }));
  expect(search('language')).toEqual(expect.arrayContaining(languages));
});

it('keeps native update terms out of browser settings and safely addresses agent identities', () => {
  expect(settingsDestinations(false).find((item) => item.id === 'general')?.keywords).not.toContain(
    'beta',
  );
  expect(settingsDestinations(true).find((item) => item.id === 'general')?.keywords).toContain(
    'beta',
  );
  expect(agentSearchTarget('lab/reviewer #1')).toBe('agent-lab%2Freviewer%20%231');
});
