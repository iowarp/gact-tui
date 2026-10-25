import { describe, expect, it } from 'vitest';
import { correctionParts, memoryChanges } from './memory-changes';

describe('recorded memory changes', () => {
  const red = '- Favorite color is red. {id=red, source=user}';
  const blue = '- Favorite color is blue. {id=blue, source=user}';
  const after = '- ~~Favorite color is red.~~ {id=red, source=user, superseded_by=blue}\n' + blue;
  it('follows explicit replacement rather than rendering retained history as new facts', () => {
    expect(memoryChanges(red, after)).toEqual([
      {
        id: 'blue',
        kind: 'updated',
        before: 'Favorite color is red.',
        after: 'Favorite color is blue.',
      },
    ]);
    expect(memoryChanges(after, after)).toEqual([]);
    expect(memoryChanges(red, blue).map((c) => c.kind)).toEqual(['removed', 'added']);
  });
  it('keeps common words and literal values in a correction', () => {
    expect(correctionParts('Favorite color is red.', 'Favorite color is blue.')).toEqual({
      prefix: 'Favorite color is ',
      removed: 'red',
      added: 'blue',
      suffix: '.',
    });
    expect(correctionParts('a', 'a')).toEqual({ prefix: 'a', removed: '', added: '', suffix: '' });
  });
});
