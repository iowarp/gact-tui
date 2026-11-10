import { hubTaskLabel, type FacetTab } from './model-facets';

/**
 * What a filter token reads as: its facet choice's name when the results list
 * it, else a name built from the token (`task:image-text-to-text` reads as
 * `Image-Text-to-Text`, as the Hub writes it).
 */
export function filterTokenName(token: string, tabs: readonly FacetTab[]): string {
  for (const tab of tabs) {
    for (const group of tab.groups) {
      const chip = group.chips.find((item) => item.token === token);
      if (chip) return chip.label;
    }
  }
  const split = token.indexOf(':');
  if (split < 0) return capitalized(token.replaceAll('-', ' '));
  const key = token.slice(0, split);
  const value = token.slice(split + 1);
  if (key === 'task') return hubTaskLabel(value);
  if (key === 'provider') return value;
  if (key === 'cap') return capitalized(value.replaceAll('-', ' '));
  return `${capitalized(key)} ${value.replaceAll('-', ' ')}`;
}

function capitalized(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}
