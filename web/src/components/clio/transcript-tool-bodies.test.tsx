import type { ToolPresentationBlock } from '@clio/core/v3';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TranscriptDiffBody as Body } from './transcript-tool-bodies';

const TranscriptDiffBody = (props: Parameters<typeof Body>[0]) => (
  <TooltipProvider>
    <Body {...props} />
  </TooltipProvider>
);

afterEach(cleanup);

const longLine = `    return "${'x'.repeat(400)}"`;
const diff = [
  '--- a/lineage_demo/pipeline.py',
  '+++ b/lineage_demo/pipeline.py',
  '@@ -1,2 +1,3 @@',
  ' import json',
  '-def old():',
  '+def load():',
  `+${longLine}`,
].join('\n');

const block = (path: string) =>
  ({ type: 'diff', path, text: diff }) as unknown as ToolPresentationBlock;

it('colours code lines with the theme syntax tokens once the highlighter loads', async () => {
  const { container } = render(<TranscriptDiffBody block={block('lineage_demo/pipeline.py')} />);
  const added = () => container.querySelector('[data-diff-line="added"]')!;
  const removed = () => container.querySelector('[data-diff-line="removed"]')!;
  expect(added()).toHaveTextContent('def load():');
  await waitFor(
    () => {
      expect(added().querySelector('span[style*="--syntax-token-keyword"]')).not.toBeNull();
      expect(removed().querySelector('span[style*="--syntax-token-keyword"]')).not.toBeNull();
    },
    { timeout: 20_000 },
  );
  // Colour never changes the text a row reads or copies.
  expect(added()).toHaveTextContent('Added: def load():');
  expect(removed()).toHaveTextContent('Removed: def old():');
}, 30_000);

it('leaves a plain-text change uncoloured', async () => {
  const { container } = render(<TranscriptDiffBody block={block('notes/readme.txt')} />);
  // Give a would-be highlighter time to land before asserting it never does.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(container.querySelector('span[style*="--syntax-"]')).toBeNull();
});
