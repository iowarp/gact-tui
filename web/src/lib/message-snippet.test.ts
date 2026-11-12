import { describe, expect, it } from 'vitest';
import { messageSnippetText } from './message-snippet';

describe('messageSnippetText', () => {
  it('keeps underscores in paths, tool names and dunder names', () => {
    expect(messageSnippetText('Edited lineage_demo/pipeline.py with `create_artifact`.')).toBe(
      'Edited lineage_demo/pipeline.py with create_artifact.',
    );
    expect(messageSnippetText('See __init__.py and _private_helper')).toBe(
      'See __init__.py and _private_helper',
    );
  });

  it('drops markdown that only styles the words', () => {
    expect(
      messageSnippetText('## Result\n- **Saved** the *plot* to [the file](out/plot.png)\n> note'),
    ).toBe('Result Saved the plot to the file note');
  });

  it('leaves arithmetic and lone asterisks alone', () => {
    expect(messageSnippetText('2 * 3 = 6 and a*b*c')).toBe('2 * 3 = 6 and a*b*c');
  });
});
