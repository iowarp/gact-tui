import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SentReferenceMessage } from './sent-reference-message';

/** How messages sent before comment sessions quoted an attachment ahead of the text. */
function messageTextWithAnnotations(
  annotations: ReadonlyArray<{ kind: string; markdown?: string; text?: string }>,
  text: string,
): string {
  const quoted = annotations.map((annotation) =>
    (annotation.kind === 'text-quote' ? (annotation.text ?? '') : (annotation.markdown ?? ''))
      .split(/\r?\n/u)
      .map((line) => (line.trim() ? `> ${line}` : '>'))
      .join('\n'),
  );
  return [...quoted, text].filter(Boolean).join('\n\n');
}


afterEach(cleanup);

describe('SentReferenceMessage', () => {
  it('keeps the question visible and the full reference closed but inspectable', () => {
    const markdown = '**Storm tracks**\nDataset: Hurricanes.\n\nZone: 12 selected observations.\n\n```json\n{"dataUri":"artifact:test","selection":{"values":[1,2]}}\n```';
    const text = messageTextWithAnnotations([{ kind: 'data-zone-quote', markdown }], 'Did the storm strengthen here?');
    const { container } = render(<SentReferenceMessage text={text} />);
    expect(screen.getByText('Did the storm strengthen here?')).toBeVisible();
    expect(screen.getByText('12 selected observations.')).toBeVisible();
    const details = container.querySelector('details');
    expect(details).not.toHaveAttribute('open');
    expect(details?.textContent).toContain('artifact:test');
  });
  it('renders ordinary quoted prose without making it a data attachment', () => {
    const { container } = render(<SentReferenceMessage text={'> Some words\n\nExplain this.'} />);
    expect(container.querySelector('details')).toBeNull();
    expect(container).toHaveTextContent('> Some words Explain this.');
  });
});
