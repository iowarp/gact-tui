/**
 * Composer contract (gact-tui#334) + the user-bubble correction to #333.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from '../../src/composer/Composer';

const COMPOSER_CSS = readFileSync(
  resolve(__dirname, '..', '..', 'src', 'composer', 'composer.css'),
  'utf8',
);

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const props = {
    placement: 'ares:/scratch/j4471',
    asyncCount: 2,
    contextPercent: 41,
    models: [
      { id: 'sonnet', label: 'claude-sonnet-5', detail: 'Anthropic' },
      { id: 'opus', label: 'claude-opus-5', detail: 'Anthropic' },
    ],
    modelId: 'sonnet',
    onModelChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<Composer {...props} />) };
}

describe('Composer', () => {
  it('shows the placement, async and context chips', () => {
    renderComposer();
    expect(screen.getByText('ares:/scratch/j4471')).toBeInTheDocument();
    expect(screen.getByText(/async 2/)).toBeInTheDocument();
    expect(screen.getByText(/ctx 41%/)).toBeInTheDocument();
  });

  it('cannot submit an empty message', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cannot submit whitespace only', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   \n  ' } });
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits text with the active mode and clears the field', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'plot the station' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSubmit).toHaveBeenCalledWith({ text: 'plot the station', mode: 'ask' });
    expect(box).toHaveValue('');
  });

  it('sends on Enter and inserts a newline on Shift+Enter', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'go' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith({ text: 'go', mode: 'ask' });
  });

  it('switches between ask and execute modes', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    fireEvent.click(screen.getByRole('button', { name: /execute/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'run it' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith({ text: 'run it', mode: 'execute' });
  });

  it('picks a model through the kit select', () => {
    const onModelChange = vi.fn();
    renderComposer({ onModelChange });
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    fireEvent.click(screen.getByRole('option', { name: /claude-opus-5/ }));
    expect(onModelChange).toHaveBeenCalledWith('opus');
  });

  it('blocks input and says why while the turn is busy', () => {
    // No silent no-op: a disabled composer must state its reason.
    renderComposer({ busy: true, busyReason: 'turn in progress' });
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByTestId('composer-busy')).toHaveTextContent('turn in progress');
  });
});

/**
 * Send-while-busy message queue (mainQ) — prototype's queueRows()/mq.up/
 * mq.down/mq.startEdit/mq.rm/mainQNow, transcribed from LayerChrome-adjacent
 * source (design/prototype/Clio Session.html). Enqueueing only replaces the
 * hard block when the caller actually wires a destination for it
 * (`onQueueMessage`) — supplying `busy` alone keeps the old block, matching
 * the plain-busy test above.
 */
describe('send-while-busy message queue', () => {
  it('keeps a hard block when busy and no queue destination is wired', () => {
    renderComposer({ busy: true, busyReason: 'turn in progress' });
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('enqueues instead of blocking once a queue destination is wired', () => {
    const onSubmit = vi.fn();
    const onQueueMessage = vi.fn();
    renderComposer({ busy: true, onSubmit, onQueueMessage });
    const box = screen.getByRole('textbox');
    expect(box).not.toBeDisabled();
    fireEvent.change(box, { target: { value: 'check on that' } });
    const send = screen.getByRole('button', { name: /queue for the next step boundary/i });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(onQueueMessage).toHaveBeenCalledWith('check on that');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue('');
  });

  it('renders the tray with reorder/edit/remove controls and delivers on demand', () => {
    const onReorderQueuedMessage = vi.fn();
    const onEditQueuedMessage = vi.fn();
    const onRemoveQueuedMessage = vi.fn();
    const onDeliverQueuedNow = vi.fn();
    renderComposer({
      busy: true,
      onQueueMessage: vi.fn(),
      queuedMessages: [
        { id: 'q1', text: 'first held message' },
        { id: 'q2', text: 'second held message' },
      ],
      onReorderQueuedMessage,
      onEditQueuedMessage,
      onRemoveQueuedMessage,
      onDeliverQueuedNow,
    });

    expect(screen.getByText('2 messages queued')).toBeInTheDocument();
    expect(screen.getByText('first held message')).toBeInTheDocument();
    expect(screen.getByText('second held message')).toBeInTheDocument();
    expect(screen.getByTestId('composer-frame')).toHaveAttribute('data-queued', 'true');

    const downs = screen.getAllByRole('button', { name: 'Move later in the queue', hidden: true });
    fireEvent.click(downs[0]!);
    expect(onReorderQueuedMessage).toHaveBeenCalledWith('q1', 'down');

    const editButtons = screen.getAllByRole('button', { name: 'Edit in place', hidden: true });
    fireEvent.click(editButtons[0]!);
    const editInput = screen.getByRole('textbox', { name: /edit queued message 1/i });
    fireEvent.change(editInput, { target: { value: 'first held message, revised' } });
    fireEvent.blur(editInput);
    expect(onEditQueuedMessage).toHaveBeenCalledWith('q1', 'first held message, revised');

    const removeButtons = screen.getAllByRole('button', { name: 'Remove from queue', hidden: true });
    fireEvent.click(removeButtons[1]!);
    expect(onRemoveQueuedMessage).toHaveBeenCalledWith('q2');

    fireEvent.click(screen.getByRole('button', { name: /interrupt and deliver/i }));
    expect(onDeliverQueuedNow).toHaveBeenCalled();
  });

  it('docks the tray directly below the pill row, never above it (prototype DOM order)', () => {
    const { container } = renderComposer({
      busy: true,
      onQueueMessage: vi.fn(),
      queuedMessages: [{ id: 'q1', text: 'held' }],
    });
    const pill = container.querySelector('.composer__pillbox');
    const tray = screen.getByTestId('composer-queue');
    expect(pill).toBeInTheDocument();
    // DOCUMENT_POSITION_FOLLOWING (4) on `pill` means pill comes BEFORE tray.
    // eslint-disable-next-line no-bitwise
    expect(pill!.compareDocumentPosition(tray) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The queue tray's own top-left corner stays square (only the top-right
    // rounds) so it continues the pill's square bottom-left corner in one
    // unbroken left edge — verified live against the prototype's own
    // computed style (border-radius: 0px 14px 0px 0px). jsdom does not apply
    // imported stylesheets, so the rule itself is asserted straight from
    // composer.css rather than a computed style.
    expect(COMPOSER_CSS).toMatch(/\.composer__queue\s*\{[^}]*border-radius:\s*0\s+14px\s+0\s+0;/);
  });

  it('states the header hint verbatim from the prototype (mainQHint), distinct from the row hint', () => {
    renderComposer({
      busy: true,
      onQueueMessage: vi.fn(),
      queuedMessages: [{ id: 'q1', text: 'held' }],
    });
    expect(
      screen.getByText('main is mid-step · delivered at the next step boundary'),
    ).toBeInTheDocument();
    // The row's own hint is a DIFFERENT prototype string (present tense,
    // no "main is mid-step" prefix) — the two must not collapse to one.
    expect(screen.getByText('delivers at the next step boundary')).toBeInTheDocument();
  });

  it('disables the boundary reorder controls on the first and last row', () => {
    renderComposer({
      busy: true,
      onQueueMessage: vi.fn(),
      queuedMessages: [
        { id: 'q1', text: 'a' },
        { id: 'q2', text: 'b' },
      ],
      onReorderQueuedMessage: vi.fn(),
    });
    const ups = screen.getAllByRole('button', { name: 'Move earlier in the queue', hidden: true });
    const downs = screen.getAllByRole('button', { name: 'Move later in the queue', hidden: true });
    expect(ups[0]).toBeDisabled();
    expect(downs[1]).toBeDisabled();
    expect(ups[1]).not.toBeDisabled();
    expect(downs[0]).not.toBeDisabled();
  });

  it('renders no tray at all when the queue is empty', () => {
    renderComposer({ busy: true, onQueueMessage: vi.fn(), queuedMessages: [] });
    expect(screen.queryByTestId('composer-queue')).toBeNull();
    expect(screen.getByTestId('composer-frame')).not.toHaveAttribute('data-queued');
  });
});

describe('Shift+Tab expand (S2)', () => {
  // Not in the bundled prototype export — `'Tab'` appears nowhere in it — but
  // the owner added it deliberately to the design, so it is built to spec.
  it('starts collapsed', () => {
    render(<Composer models={[]} modelId="" onModelChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByTestId('composer-frame')).not.toHaveAttribute('data-expanded');
  });

  it('expands on Shift+Tab and collapses on a second press', () => {
    render(<Composer models={[]} modelId="" onModelChange={() => {}} onSubmit={() => {}} />);
    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('composer-frame')).toHaveAttribute('data-expanded', 'true');

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('composer-frame')).not.toHaveAttribute('data-expanded');
  });

  it('does not expand on a plain Tab, which must still move focus', () => {
    render(<Composer models={[]} modelId="" onModelChange={() => {}} onSubmit={() => {}} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });
    expect(screen.getByTestId('composer-frame')).not.toHaveAttribute('data-expanded');
  });

  it('keeps the typed text across an expand', () => {
    render(<Composer models={[]} modelId="" onModelChange={() => {}} onSubmit={() => {}} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'half a thought' } });
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('textbox')).toHaveValue('half a thought');
  });
})
