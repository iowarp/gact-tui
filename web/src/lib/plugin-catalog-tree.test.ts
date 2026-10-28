import { pluginEntrySchema } from '@clio/core/v3';
import { expect, it } from 'vitest';
import { catalogRoots, catalogMatches, catalogMember } from './plugin-catalog-tree';
const plugin = (id: string, members: string[] = [], market = 'clio') =>
  pluginEntrySchema.parse({
    id,
    ref: `${market}/${id}`,
    marketplace: market,
    kind: members.length ? 'pack' : 'plugin',
    members,
  });
it('nests installed members under their pack and preserves ancestry during search', () => {
  const pack = plugin('documents', ['pdf']);
  const pdf = plugin('pdf');
  const list = [pdf, pack];
  expect(catalogRoots(list)).toEqual([pack]);
  expect(catalogMatches(list, pack, 'pdf')).toBe(true);
  expect(catalogMatches(list, pack, 'missing')).toBe(false);
});
it('respects qualified sources and leaves ambiguous short members unresolved', () => {
  const a = plugin('pdf', [], 'lab');
  const b = plugin('pdf', [], 'other');
  const p = plugin('documents', ['pdf']);
  expect(catalogMember([a, b, p], p, 'pdf')).toBeUndefined();
  expect(catalogMember([a, b, p], p, 'other/pdf@^1')).toEqual(b);
});
it('keeps cyclic packs discoverable without recursive search loops', () => {
  const a = plugin('a', ['b']);
  const b = plugin('b', ['a']);
  const list = [a, b];
  expect(catalogRoots(list)).toHaveLength(1);
  expect(catalogMatches(list, a, 'missing')).toBe(false);
});
