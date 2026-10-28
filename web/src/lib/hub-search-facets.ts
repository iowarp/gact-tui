import type { FacetTab } from './model-facets';

/** Remote query choices are independent of which modalities appear in the current page. */
export function hubSearchFacets(tabs: FacetTab[], tokens: readonly string[]): FacetTab[] {
  const result = tabs.map((tab) => ({
    ...tab,
    groups: tab.groups.map((group) => ({
      ...group,
      chips: group.chips.map((chip) => ({ ...chip, remote: true })),
    })),
  }));
  for (const axis of ['input', 'output'] as const) {
    let tab = result.find((item) => item.id === axis);
    if (!tab) {
      tab = { id: axis, label: axis === 'input' ? 'Input' : 'Output', groups: [], chipCount: 0 };
      result.push(tab);
    }
    const existing = new Set(tab.groups.flatMap((group) => group.chips.map((chip) => chip.token)));
    const chips = ['text', 'image', 'audio', 'video']
      .filter((value) => !existing.has(`${axis}:${value}`))
      .map((value) => ({
        token: `${axis}:${value}`,
        label: value.charAt(0).toUpperCase() + value.slice(1),
        count: 0,
        remote: true,
        active: tokens.includes(`${axis}:${value}`),
        replaces: [],
        icon: {
          kind: 'tag' as const,
          tag: {
            axis: `${axis}_modality` as 'input_modality' | 'output_modality',
            value,
            evidence: [],
          },
        },
      }));
    if (chips.length) tab.groups.push({ id: `remote-${axis}`, label: '', chips });
    tab.chipCount = tab.groups.reduce((count, group) => count + group.chips.length, 0);
  }
  return result;
}
