import { createContext } from 'react';
import type { ApplicationDestination } from './application-destinations';
import { matchesGlobalSearch } from './global-search-commands';
import { settingsSearchRows, type SettingsSearchRow } from './settings-search-rows';
import { groupedSettingsSections } from './settings-window-route';

/** One section's matches in the filtered Settings window, under its breadcrumb head. */
export interface SettingsResultBlock {
  /** The page the rows live on, a folded one (Helper models) included. */
  section: ApplicationDestination;
  /** The listed page a folded one sits in (Models for Helper models). */
  host?: ApplicationDestination;
  /** The scope group the page belongs to: App, Workspace or Agent. */
  scope: string;
  /** Matching settings, shown live on the page. */
  rows: SettingsSearchRow[];
  /** Matching lists, each shown as one row that opens the section. */
  lists: SettingsSearchRow[];
  /** The section matched by its name or keywords, with no row of its own matching. */
  nameOnly: boolean;
}

export interface SettingsSearchResults {
  blocks: SettingsResultBlock[];
  /** Rows shown per listed section, a folded page counted in its host's. */
  counts: Record<string, number>;
  total: number;
}

/**
 * What the filtered Settings window shows for a query, in the nav's order. A row
 * matches as it does in the global search (its name, its section's name, its
 * keywords), so the window lists what Ctrl K counted as settings.
 */
export function settingsSearchResults(
  sections: ApplicationDestination[],
  query: string,
): SettingsSearchResults {
  const rows = settingsSearchRows();
  const blocks: SettingsResultBlock[] = [];
  const counts: Record<string, number> = {};
  let total = 0;
  if (!query.trim()) return { blocks, counts, total };
  for (const { group, items } of groupedSettingsSections(sections)) {
    for (const listed of items) {
      const folded = sections.filter((item) => item.host === listed.id);
      for (const section of [listed, ...folded]) {
        const matched = rows.filter(
          (row) =>
            row.section === section.id &&
            matchesGlobalSearch(query, row.label, 'Settings', section.label, row.keywords),
        );
        const nameOnly =
          !matched.length &&
          matchesGlobalSearch(query, section.label, 'Settings', section.group, section.keywords);
        if (!matched.length && !nameOnly) continue;
        blocks.push({
          section,
          host: section === listed ? undefined : listed,
          scope: group,
          rows: matched.filter((row) => !row.list),
          lists: matched.filter((row) => row.list),
          nameOnly,
        });
        const shown = nameOnly ? 1 : matched.length;
        counts[listed.id] = (counts[listed.id] ?? 0) + shown;
        total += shown;
      }
    }
  }
  return { blocks, counts, total };
}

/** The rows a section shows inside the filtered window, and the query to mark in them. */
export interface SettingsResultsFilter {
  query: string;
  labels: ReadonlySet<string>;
}

/** Set around a section in the filtered window: its other rows hide. */
export const SettingsResultsContext = createContext<SettingsResultsFilter | undefined>(undefined);
