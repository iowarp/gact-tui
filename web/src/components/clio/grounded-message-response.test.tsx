import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { groundedMessageSegments } from '@/lib/grounded-message-sources';
import { GroundedMessageResponse } from './grounded-message-response';

afterEach(cleanup);

describe('GroundedMessageResponse', () => {
  it('projects consecutive standalone source entries as source objects', async () => {
    const text = [
      '**FACT** — SWMR limits structural changes.',
      '- Source: [Introduction to SWMR — HDF Group support site](https://support.hdfgroup.org/intro)',
      '- Source: [SWMR technical note](https://support.hdfgroup.org/note) — current reference',
      '',
      '**Conclusion:** the objects must exist first.',
    ].join('\n');

    expect(groundedMessageSegments(text)).toEqual([
      { kind: 'markdown', text: '**FACT** — SWMR limits structural changes.' },
      {
        kind: 'sources',
        sources: [
          {
            href: 'https://support.hdfgroup.org/intro',
            title: 'Introduction to SWMR — HDF Group support site',
          },
          {
            description: 'current reference',
            href: 'https://support.hdfgroup.org/note',
            title: 'SWMR technical note',
          },
        ],
      },
      { kind: 'markdown', text: '\n**Conclusion:** the objects must exist first.' },
    ]);

    render(<GroundedMessageResponse>{text}</GroundedMessageResponse>);

    expect(await screen.findByRole('button', { name: /2 sources/u })).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Introduction to SWMR — HDF Group support site/u }),
    ).toHaveAttribute('href', 'https://support.hdfgroup.org/intro');
    expect(screen.getByText('current reference')).toBeVisible();
    expect(screen.queryByText(/^Source:/u)).not.toBeInTheDocument();
    expect(screen.getByText(/the objects must exist first/u)).toBeVisible();
  });

  it('leaves ordinary Markdown links in the response body', () => {
    const text = 'Read the [HDF5 documentation](https://support.hdfgroup.org/) for details.';

    expect(groundedMessageSegments(text)).toEqual([{ kind: 'markdown', text }]);
  });
});
