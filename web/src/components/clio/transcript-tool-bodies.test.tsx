import type { ToolPresentationBlock } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

it('tints each changed row across the whole scrolled width of its longest line', () => {
  render(<TranscriptDiffBody block={block('lineage_demo/pipeline.py')} />);
  const table = screen.getByRole('table', { name: 'Changes' });
  const rows = screen.getAllByRole('rowgroup')[0]!;
  expect(table).toContainElement(rows);
  // The row group sizes to its content, so a row and its tint grow past the viewport.
  expect(rows).toHaveClass('w-max', 'min-w-full');
  const added = table.querySelectorAll('[data-diff-line="added"]');
  expect(added).toHaveLength(2);
  expect(added[1]).toHaveClass('bg-success/12');
  expect(added[1]).toHaveTextContent(longLine.trim());
});

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
