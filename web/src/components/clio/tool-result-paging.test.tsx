import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';

const { page } = vi.hoisted(() => ({ page: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ toolPresentationContent: page }),
}));
afterEach(cleanup);
beforeEach(() => {
  page.mockReset();
  Range.prototype.getClientRects = vi.fn(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        top: i * 24,
        bottom: (i + 1) * 24,
        width: 100,
        height: 24,
      })) as unknown as DOMRectList,
  );
});

function view() {
  return render(
    <ClioToolInvocation
      tool={{
        id: 'call',
        session_id: 'session',
        name: 'arbitrary',
        state: 'succeeded',
        presentation: {
          summary: '',
          blocks: [
            {
              id: 'body',
              type: 'text',
              text: 'first ',
              content_ref: {
                session_id: 'session',
                call_id: 'call',
                block_id: 'body',
                cursor: 6,
                total_chars: 17,
              },
            },
          ],
        },
      }}
    />,
  );
}

describe('full presentation viewer paging', () => {
  it('exposes the loaded widget schema in details and retrieves the complete recorded content', async () => {
    page.mockResolvedValueOnce({
      text: 'the complete image schema',
      cursor: 6,
      next_cursor: null,
      total_chars: 31,
    });
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'catalog-call',
          session_id: 'session',
          name: 'load_skill',
          state: 'succeeded',
          title: 'Load skill',
          input: {
            skill_id: 'a2ui-catalog-clio-workspace',
            file: 'catalog.json#/components/Image',
          },
          output: {
            skill_id: 'a2ui-catalog-clio-workspace',
            file: 'catalog.json#/components/Image',
            lines: 40,
          },
          presentation: {
            subject: 'skill',
            summary: '',
            blocks: [
              { id: 'skill', type: 'text', text: 'a2ui-catalog-clio-workspace' },
              {
                id: 'content',
                type: 'text',
                text: 'first ',
                content_ref: {
                  session_id: 'session',
                  call_id: 'catalog-call',
                  block_id: 'content',
                  cursor: 6,
                  total_chars: 31,
                },
              },
            ],
          },
        }}
      />,
    );
    expect(container.querySelector('[data-slot="tool-human-result"]')).toBeNull();
    expect(page).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Technical details for Inspect widget catalog' }),
    );
    const loaded = screen.getByRole('region', { name: 'Loaded widget catalog' });
    expect(loaded).toHaveTextContent('first');
    await userEvent.click(within(loaded).getByRole('button', { name: 'Load complete content' }));
    await waitFor(() => expect(loaded).toHaveTextContent('the complete image schema'));
    expect(page).toHaveBeenCalledWith(
      'session',
      'catalog-call',
      'content',
      6,
      expect.any(AbortSignal),
    );
  });
  it('keeps file metadata and paged Markdown in one surface and one expansion', async () => {
    page.mockResolvedValueOnce({
      text: 'complete body',
      cursor: 6,
      next_cursor: null,
      total_chars: 19,
    });
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'call',
          session_id: 'session',
          name: 'arbitrary',
          state: 'succeeded',
          presentation: {
            subject: 'file-link',
            summary: '19 bytes',
            blocks: [
              {
                id: 'file-link',
                type: 'link',
                target: 'file',
                uri: 'D:/workspace/example.md',
                label: 'example.md',
              },
              { id: 'metadata', type: 'text', text: 'Name: Readable document' },
              {
                id: 'body',
                type: 'markdown',
                text: 'first ',
                content_ref: {
                  session_id: 'session',
                  call_id: 'call',
                  block_id: 'body',
                  cursor: 6,
                  total_chars: 19,
                },
              },
            ],
          },
        }}
      />,
    );
    expect(container.querySelectorAll('[data-slot="tool-result-panel"]')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Show more' })).toHaveLength(1);
    expect(page).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show more' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Name: Readable document')).toBeVisible();
    expect(await within(dialog).findByText('first complete body')).toBeVisible();
    expect(page).toHaveBeenCalledWith('session', 'call', 'body', 6, expect.any(AbortSignal));
  });
  it('one user action fetches contiguous pages and renders the complete result outside the transcript', async () => {
    page
      .mockResolvedValueOnce({ text: 'second ', cursor: 6, next_cursor: 13, total_chars: 17 })
      .mockResolvedValueOnce({ text: 'last', cursor: 13, next_cursor: null, total_chars: 17 });
    const { container } = view();
    expect(page).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show more' }));
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('first second last')).toBeVisible());
    expect(page.mock.calls).toEqual([
      ['session', 'call', 'body', 6, expect.any(AbortSignal)],
      ['session', 'call', 'body', 13, expect.any(AbortSignal)],
    ]);
    expect(container).not.toContainElement(dialog);
  });
  it('closing the viewer stops fetching and discards a late page before reopening', async () => {
    let resolvePage!: (value: unknown) => void;
    page.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve;
        }),
    );
    view();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    const signal = page.mock.calls[0]![4] as AbortSignal;
    expect(signal.aborted).toBe(false);
    await user.keyboard('{Escape}');
    expect(signal.aborted).toBe(true);
    resolvePage({ text: 'second ', cursor: 6, next_cursor: 13, total_chars: 17 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(page).toHaveBeenCalledTimes(1);
    page.mockResolvedValueOnce({
      text: 'second last',
      cursor: 6,
      next_cursor: null,
      total_chars: 17,
    });
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() =>
      expect(within(screen.getByRole('dialog')).getByText('first second last')).toBeVisible(),
    );
    expect(page.mock.calls[1]).toEqual(['session', 'call', 'body', 6, expect.any(AbortSignal)]);
  });
  it('surfaces a discontinuous cursor without appending incorrect content', async () => {
    page.mockResolvedValueOnce({ text: 'wrong', cursor: 5, next_cursor: null, total_chars: 17 });
    view();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show more' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Invalid result content cursor',
    );
    expect(screen.queryByText('wrong')).not.toBeInTheDocument();
  });
});
