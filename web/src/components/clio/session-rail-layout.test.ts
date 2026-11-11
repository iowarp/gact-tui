import { expect, it } from 'vitest';
import {
  defaultSessionRailLayout,
  railGroupSections,
  normalizeSessionRailLayout,
  reorderSessionRail,
} from './session-rail-layout';

it('drops invalid section IDs, deduplicates and appends new sections without resetting choices', () => {
  const layout = normalizeSessionRailLayout({
    order: ['files', 'context', 'files', 'obsolete'],
    hidden: ['tools', 'obsolete', 'tools'],
  });
  expect(layout.order.indexOf('files')).toBeLessThan(layout.order.indexOf('context'));
  expect(layout.order).toHaveLength(defaultSessionRailLayout().order.length);
  expect(layout.hidden).toEqual(['tools']);
  expect(layout.hideEmpty).toBe(true);
  expect(normalizeSessionRailLayout(null)).toEqual(defaultSessionRailLayout());
});

it('inserts sections a saved layout lacks after their nearest earlier default neighbour', () => {
  const layout = normalizeSessionRailLayout({
    order: ['tools', 'files', 'context', 'goal'],
    hideEmpty: false,
  });
  expect(layout.order.slice(0, 4)).toEqual(['tools', 'files', 'changes', 'sources']);
  expect(layout.order.indexOf('questions')).toBe(layout.order.indexOf('goal') + 1);
  expect(layout.hideEmpty).toBe(false);
  expect(railGroupSections(layout, 'conversation')[0]).toBe('tools');
  expect(railGroupSections(layout, 'context')).toEqual(['context']);
});

it('keeps hidden and absent sections in their saved positions when the shown subset is dragged', () => {
  const layout = {
    order: ['context', 'tools', 'files', 'goal'] as const,
    hidden: ['tools'] as const,
  };
  const result = reorderSessionRail(
    { order: [...layout.order], hidden: [...layout.hidden], hideEmpty: true },
    ['files', 'context'],
  );
  expect(result.order).toEqual(['files', 'tools', 'context', 'goal']);
  expect(result.hidden).toEqual(['tools']);
  expect(layout.order).toEqual(['context', 'tools', 'files', 'goal']);
});
