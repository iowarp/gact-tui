import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroundedMessageResponse } from './grounded-message-response';
import { PresentationNavigation } from './presentation-navigation';

afterEach(cleanup);

const sources =
  'The layers describe the basin. [SEZ layer](https://maps.example.org/32) · [Lake polygon](https://maps.example.org/1) · [Watersheds](https://maps.example.org/5)';

describe('grouped Markdown sources', () => {
  it('shows one compact control and opens the complete clickable list on hover without stealing focus', async () => {
    const user = userEvent.setup();
    render(<GroundedMessageResponse mode="static">{sources}</GroundedMessageResponse>);
    const trigger = await screen.findByRole('button', { name: 'Sources 3' });
    expect(screen.queryByRole('link', { name: /SEZ layer/u })).not.toBeInTheDocument();
    await user.hover(trigger);
    const list = await screen.findByRole('dialog', { name: 'Sources' });
    expect(within(list).getAllByRole('link')).toHaveLength(3);
    expect(within(list).getByRole('link', { name: /Lake polygon/u })).toHaveAttribute(
      'href',
      'https://maps.example.org/1',
    );
    expect(within(list).getByRole('link', { name: /Watersheds/u })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(list).not.toContainElement(document.activeElement as HTMLElement);
    await user.unhover(trigger);
    await user.hover(list);
    expect(list).toBeVisible();
    await user.unhover(list);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('supports keyboard opening, source focus, and Escape returning to the trigger', async () => {
    const user = userEvent.setup();
    render(<GroundedMessageResponse mode="static">{sources}</GroundedMessageResponse>);
    const trigger = await screen.findByRole('button', { name: 'Sources 3' });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    const first = await screen.findByRole('link', { name: /SEZ layer/u });
    expect(first).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('link', { name: /Lake polygon/u })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('opens by touch/click and dismisses outside the list', async () => {
    const user = userEvent.setup();
    render(
      <>
        <GroundedMessageResponse mode="static">{sources}</GroundedMessageResponse>
        <button>Elsewhere</button>
      </>,
    );
    const trigger = await screen.findByRole('button', { name: 'Sources 3' });
    fireEvent.pointerEnter(trigger, { pointerType: 'touch' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('retains local source routing and unavailable reference handling inside the list', async () => {
    const openFile = vi.fn();
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}
      >
        <GroundedMessageResponse mode="static">
          {
            'Evidence. [Protocol](workspace-file:/data/protocol.md) · [Missing](artifact://missing) · [Reference](https://example.org)'
          }
        </GroundedMessageResponse>
      </PresentationNavigation.Provider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Sources 3' }));
    fireEvent.click(await screen.findByRole('link', { name: /Protocol/u }));
    expect(openFile).toHaveBeenCalledTimes(1);
    expect(openFile).toHaveBeenCalledWith('/data/protocol.md');
    expect(screen.queryByRole('link', { name: /Missing/u })).not.toBeInTheDocument();
    expect(screen.getByText('Missing').closest('[aria-disabled]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('leaves a prose list of produced files as links, with no Sources chip (take 1t)', async () => {
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: vi.fn() }}
      >
        <GroundedMessageResponse mode="static">
          {
            'The [final vorticity image](workspace-file:/D:/w/naca0012_final_vorticity.png), [force history](workspace-file:/D:/w/naca0012_forces.dat); and [the log](workspace-file:/D:/w/run.log) are still in your workspace.'
          }
        </GroundedMessageResponse>
      </PresentationNavigation.Provider>,
    );
    expect(await screen.findByRole('link', { name: 'final vorticity image' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'force history' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'the log' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Sources/u })).not.toBeInTheDocument();
  });

  it('still groups numbered citations joined by commas or semicolons', async () => {
    render(
      <GroundedMessageResponse mode="static">
        {'Rainfall rose. [1](https://a.org/1), [2](https://b.org/2); [[3]](https://c.org/3)'}
      </GroundedMessageResponse>,
    );
    expect(await screen.findByRole('button', { name: 'Sources 3' })).toBeVisible();
  });

  it('keeps single links, links separated by prose, anchors and code in their original positions', async () => {
    render(
      <GroundedMessageResponse mode="static">
        {
          'Read [the guide](https://example.org) and [the notes](https://example.org/notes). [Jump](#section)\n\n`[A](https://a.org) [B](https://b.org)`'
        }
      </GroundedMessageResponse>,
    );
    expect(await screen.findByRole('link', { name: 'the guide' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'the notes' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Jump' })).toHaveAttribute('href', '#section');
    expect(screen.queryByRole('button', { name: /^Sources/u })).not.toBeInTheDocument();
    expect(screen.getByText('[A](https://a.org) [B](https://b.org)')).toBeVisible();
  });

  it('groups citations in tight lists and updates the count as a response streams', async () => {
    const { rerender } = render(
      <GroundedMessageResponse>
        {'- [A](https://a.org) [B](https://b.org)'}
      </GroundedMessageResponse>,
    );
    expect(await screen.findByRole('button', { name: 'Sources 2' })).toBeVisible();
    rerender(
      <GroundedMessageResponse>
        {'- [A](https://a.org) [B](https://b.org) [C](https://c.org)'}
      </GroundedMessageResponse>,
    );
    expect(await screen.findByRole('button', { name: 'Sources 3' })).toBeVisible();
  });

  it('retains block image handling and the existing list item styling', async () => {
    render(
      <GroundedMessageResponse mode="static">
        {'![Map](https://example.org/map.png)\n\n- [A](https://a.org) [B](https://b.org)'}
      </GroundedMessageResponse>,
    );
    expect((await screen.findByRole('img', { name: 'Map' })).closest('p')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sources 2' }).closest('li')).toHaveClass('py-1');
  });
});
