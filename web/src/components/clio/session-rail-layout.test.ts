import { expect, it } from 'vitest';
import {
  defaultSessionRailLayout,
  normalizeSessionRailLayout,
  reorderSessionRail,
} from './session-rail-layout';

it('drops invalid section IDs, deduplicates and appends new sections without resetting choices', () => {
  const layout = normalizeSessionRailLayout({
    order: ['files', 'context', 'files', 'obsolete'],
    hidden: ['tools', 'obsolete', 'tools'],
  });
  expect(layout.order.slice(0, 2)).toEqual(['files', 'context']);
  expect(layout.order).toHaveLength(defaultSessionRailLayout().order.length);
  expect(layout.hidden).toEqual(['tools']);
  expect(normalizeSessionRailLayout(null)).toEqual(defaultSessionRailLayout());
});

it('keeps hidden and absent sections in their saved positions when the shown subset is dragged', () => {
  const layout = {
    order: ['context', 'tools', 'files', 'goal'] as const,
    hidden: ['tools'] as const,
  };
  const result = reorderSessionRail({ order: [...layout.order], hidden: [...layout.hidden] }, [
    'files',
    'context',
  ]);
  expect(result.order).toEqual(['files', 'tools', 'context', 'goal']);
  expect(result.hidden).toEqual(['tools']);
  expect(layout.order).toEqual(['context', 'tools', 'files', 'goal']);
});
