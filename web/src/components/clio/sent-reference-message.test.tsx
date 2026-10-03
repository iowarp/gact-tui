import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { messageTextWithAnnotations } from '@/lib/composer-annotations';
import { SentReferenceMessage } from './sent-reference-message';

afterEach(cleanup);

describe('SentReferenceMessage', () => {
  it('keeps the question visible and the full reference closed but inspectable', () => {
    const markdown = '**Storm tracks**\nDataset: Hurricanes.\n\nZone: 12 selected observations.\n\n```json\n{"dataUri":"artifact:test","selection":{"values":[1,2]}}\n```';
    const text = messageTextWithAnnotations([{ id: 'ref', kind: 'data-zone-quote', title: 'Storm tracks', summary: '12 selected observations', markdown }], 'Did the storm strengthen here?');
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
