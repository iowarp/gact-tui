import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WindowShell } from './dialog-frame';
import { DetailPane, ListDetailLayout } from './detail-pane';

afterEach(cleanup);

function Harness({ onWindowChange }: { onWindowChange: (open: boolean) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <TooltipProvider>
      <WindowShell open onOpenChange={onWindowChange} title="Settings">
        <ListDetailLayout
          list={
            <button type="button" onClick={() => setSelected('home-assistant')}>
              Explore home-assistant
            </button>
          }
          detail={
            selected ? (
              <DetailPane title={selected} onClose={() => setSelected(null)}>
                <button type="button">Update</button>
              </DetailPane>
            ) : null
          }
        />
      </WindowShell>
    </TooltipProvider>
  );
}

describe('DetailPane', () => {
  it('opens beside the list, takes focus, and Esc closes only the pane', async () => {
    const user = userEvent.setup();
    const onWindowChange = vi.fn();
    render(<Harness onWindowChange={onWindowChange} />);

    const opener = screen.getByRole('button', { name: 'Explore home-assistant' });
    await user.click(opener);
    const pane = screen.getByRole('complementary', { name: 'home-assistant' });
    expect(pane).toHaveFocus();
    expect(screen.getByRole('heading', { level: 2, name: 'home-assistant' })).toBeVisible();

    await user.tab();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(onWindowChange).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onWindowChange).toHaveBeenCalledWith(false);
  });

  it('closes from × with a hover name', async () => {
    const user = userEvent.setup();
    render(<Harness onWindowChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Explore home-assistant' }));
    const pane = screen.getByRole('complementary', { name: 'home-assistant' });
    await user.click(within(pane).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('hides the list under 40rem of container width only while a pane is open', () => {
    const { rerender, container } = render(<ListDetailLayout list={<p>List</p>} detail={null} />);
    const list = () => container.querySelector('[data-slot="list-detail"] > div')!;
    expect(list().className).not.toContain('@max-[40rem]:hidden');
    rerender(
      <TooltipProvider>
        <ListDetailLayout
          list={<p>List</p>}
          detail={
            <DetailPane title="Plugin" onClose={() => {}}>
              Body
            </DetailPane>
          }
        />
      </TooltipProvider>,
    );
    expect(list().className).toContain('@max-[40rem]:hidden');
  });
});
