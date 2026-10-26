import { expect, it } from 'vitest';
import {
  bundleFileTarget,
  remarkBundleFiles,
  SCOPED_DOCUMENT_LINK,
} from './scoped-document-navigation';

it('opens only known bundle members and confines parent-relative navigation', () => {
  const files = ['SKILL.md', 'references/helper.md'];
  expect(bundleFileTarget('SKILL.md', 'references/helper.md#examples', files)).toBe(
    'references/helper.md',
  );
  expect(bundleFileTarget('references/helper.md', '../SKILL.md', files)).toBe('SKILL.md');
  for (const href of [
    '../../SKILL.md',
    '%2e%2e/SKILL.md',
    'https://example.test',
    'C:/SKILL.md',
    '\\SKILL.md',
    'unknown.md',
  ])
    expect(bundleFileTarget('SKILL.md', href, files)).toBeUndefined();
  const tree = { type: 'root', children: [{ type: 'link', url: 'references/helper.md' }] };
  remarkBundleFiles('SKILL.md', files)()(tree);
  expect(tree.children[0].url).toBe(SCOPED_DOCUMENT_LINK + 'references%2Fhelper.md');
});
