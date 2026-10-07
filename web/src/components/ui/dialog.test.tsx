import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Button } from './button';

afterEach(cleanup);

describe('shared dialog controls', () => {
  it('preserves the full accessible title and restores the trigger after Escape', async () => {
    const user = userEvent.setup();
    const title = `Review ${'calibration-records-'.repeat(8)}final.docx`;
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Review document</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Review the complete recorded document.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Review document' }));
    expect(screen.getByRole('dialog', { name: title })).toBeVisible();
    expect(screen.getByRole('heading', { name: title })).toHaveTextContent(title);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review document' })).toHaveFocus();
  });

  it('lets a caller supply its own close action without an extra corner button', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open review</Button>
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Document review</DialogTitle>
            <DialogDescription>Review the document before continuing.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Open review' }));
    expect(screen.queryByRole('button', { name: /^Close$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open review' })).toHaveFocus();
  });
});
