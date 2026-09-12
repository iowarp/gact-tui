import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentationNavigation } from './presentation-navigation';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';

afterEach(cleanup);
// These assertions exercise the completed Markdown view, not lazy-module startup.
beforeAll(async () => {
  await import('@/components/ai-elements/markdown');
});
beforeEach(() => {
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
});

describe('ClioToolInvocation content and subject rendering', () => {
  it('does not create an empty panel for empty declared prose', () => {
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'empty',
          session_id: 's',
          name: 'declared_empty',
          state: 'succeeded',
          presentation: {
            summary: 'No schedules',
            blocks: [{ id: 'none', type: 'text', text: '' }],
          },
        }}
      />,
    );
    expect(screen.getByText('No schedules')).toBeVisible();
    expect(container.querySelector('[data-slot="tool-result-panel"]')).toBeNull();
  });
  it('insets rendered Markdown and keeps table action chrome out of the preview', async () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'markdown-preview',
          session_id: 's',
          name: 'declared_document',
          state: 'succeeded',
          presentation: {
            summary: '',
            blocks: [
              {
                id: 'document',
                type: 'markdown',
                text: '# Readable result\n\n| Feature | Value |\n| --- | --- |\n| Format | Markdown |',
              },
            ],
          },
        }}
      />,
    );
    const heading = await screen.findByRole('heading', { name: 'Readable result' });
    expect(heading.parentElement).toHaveClass('px-2', 'py-1');
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Copy table' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View fullscreen' })).not.toBeInTheDocument();
  });
  it('renders a declared action and clickable subject once in the row, never the payload', async () => {
    const openFile = vi.fn();
    const path = 'D:/workspace/long-readable-evidence.txt';
    const { container } = render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}
      >
        <ClioToolInvocation
          tool={{
            id: 'call',
            session_id: 's',
            name: 'internal_overloaded_tool_name',
            state: 'succeeded',
            duration_ms: 42,
            input: { payload: 'RAW PAYLOAD' },
            presentation: {
              action: 'Write',
              subject: 'file',
              summary: '',
              blocks: [
                {
                  id: 'file',
                  type: 'link',
                  target: 'file',
                  uri: path,
                  label: 'long-readable-evidence.txt',
                },
                {
                  id: 'effect',
                  type: 'diff',
                  text: '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new\n',
                },
              ],
            },
          }}
        />
      </PresentationNavigation.Provider>,
    );
    const row = container.querySelector('[data-slot="activity-row"]')!;
    const file = screen.getByRole('button', { name: 'long-readable-evidence.txt' });
    expect(row).toContainElement(file);
    expect(row).toHaveTextContent('Write');
    expect(container.querySelector('[data-slot="tool-human-result"]')).not.toContainElement(file);
    expect(container).not.toHaveTextContent('RAW PAYLOAD');
    expect(container.querySelector('[data-diff-line="addition"]')).toHaveTextContent('+new');
    expect(container.querySelector('[data-diff-line="deletion"]')).toHaveTextContent('-old');
    expect(container.querySelectorAll('[data-diff-line]')).toHaveLength(5);
    await userEvent.setup().click(file);
    expect(openFile).toHaveBeenCalledWith(path);
  });
  it('does not hide content if a declared subject is not a text or link block', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'c',
          session_id: 's',
          name: 'unknown',
          state: 'succeeded',
          presentation: {
            action: 'Inspect',
            subject: 'body',
            summary: '',
            blocks: [{ id: 'body', type: 'code', text: 'preserved content' }],
          },
        }}
      />,
    );
    expect(screen.getByText('preserved content')).toBeVisible();
  });
  it('uses the file subject language for persisted read results without a declaration', () => {
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'read-python',
          session_id: 's',
          name: 'fs_read_file',
          state: 'succeeded',
          presentation: {
            action: 'Read',
            subject: 'file-link',
            summary: '46 bytes',
            blocks: [
              {
                id: 'file-link',
                type: 'link',
                target: 'file',
                uri: 'D:\\workspace\\example.py',
                label: 'example.py',
              },
              { id: 'file', type: 'code', text: 'def answer():\n    return 43' },
            ],
          },
        }}
      />,
    );
    expect(container.querySelector('[data-language="python"]')).toBeInTheDocument();
  });
  it('normalizes workspace resource reads into a bounded file preview', () => {
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'read-resource',
          session_id: 's',
          name: 'workspace_resource_read',
          title: 'Read',
          state: 'succeeded',
          presentation: {
            subject: 'resource',
            summary: '',
            blocks: [
              {
                id: 'resource',
                type: 'link',
                target: 'resource',
                uri: 'res_html',
                label: 'brief.html',
              },
              { id: 'content', type: 'text', text: '<!doctype html>\n<title>Brief</title>' },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText('Read resource')).toBeVisible();
    expect(container.querySelector('[data-slot="tool-result-panel"]')).toBeInTheDocument();
    expect(container.querySelector('[data-language="html"]')).toBeInTheDocument();
  });
  it('labels workspace resource searches and links structured line matches to the resource', async () => {
    const openResource = vi.fn();
    const resource = { id: 'res_html', name: 'brief.html' } as never;
    render(
      <PresentationNavigation.Provider
        value={{
          artifacts: {},
          subagents: {},
          resources: { res_html: resource },
          onOpenResource: openResource,
        }}
      >
        <ClioToolInvocation
          tool={{
            id: 'search-resource',
            session_id: 's',
            name: 'workspace_resource_search',
            title: 'Search',
            state: 'succeeded',
            presentation: {
              subject: 'resource',
              summary: '2 matches for “Meridian”',
              blocks: [
                {
                  id: 'resource',
                  type: 'link',
                  target: 'resource',
                  uri: 'res_html',
                  label: 'brief.html',
                },
                { id: 'matches', type: 'text', text: '13: first match\n31: second match' },
              ],
            },
          }}
        />
      </PresentationNavigation.Provider>,
    );
    expect(screen.getByText('Search resource')).toBeVisible();
    expect(screen.getByText('Matches in brief.html')).toBeVisible();
    expect(screen.getByText('first match')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Line 13' }));
    expect(openResource).toHaveBeenCalledWith(resource);
  });
  it('keeps the document fast-path for a file read with only document blocks', () => {
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'read-report',
          session_id: 's',
          name: 'fs_read_file',
          state: 'succeeded',
          presentation: {
            action: 'Read',
            subject: 'file-link',
            summary: '',
            blocks: [
              {
                id: 'file-link',
                type: 'link',
                target: 'file',
                uri: 'D:\\workspace\\report.md',
                label: 'report.md',
              },
              { id: 'body', type: 'text', text: 'Report body content unique-marker-xyz' },
            ],
          },
        }}
      />,
    );
    expect(container.querySelectorAll('[data-slot="tool-result-panel"]')).toHaveLength(1);
    expect(screen.getByText('Report body content unique-marker-xyz')).toBeVisible();
  });
  it('keeps the document fast-path and renders an appended input-source provenance link (#1336)', async () => {
    const openFile = vi.fn();
    const { container } = render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}
      >
        <ClioToolInvocation
          tool={{
            id: 'read-report-with-input',
            session_id: 's',
            name: 'fs_read_file',
            state: 'succeeded',
            presentation: {
              action: 'Read',
              subject: 'file-link',
              summary: '',
              blocks: [
                {
                  id: 'file-link',
                  type: 'link',
                  target: 'file',
                  uri: 'D:\\workspace\\report.md',
                  label: 'report.md',
                },
                { id: 'body', type: 'text', text: 'Report body content unique-marker-xyz' },
                {
                  id: 'input-source-0',
                  type: 'link',
                  target: 'file',
                  uri: 'D:\\workspace\\inputs\\data.csv',
                  label: 'data.csv',
                  detail: 'Read as input',
                },
              ],
            },
          }}
        />
      </PresentationNavigation.Provider>,
    );
    expect(container.querySelectorAll('[data-slot="tool-result-panel"]')).toHaveLength(1);
    expect(screen.getByText('Report body content unique-marker-xyz')).toBeVisible();
    const inputLink = screen.getByRole('button', { name: 'data.csv' });
    expect(inputLink).toBeVisible();
    await userEvent.setup().click(inputLink);
    expect(openFile).toHaveBeenCalledWith('D:\\workspace\\inputs\\data.csv');
  });
  it('renders the incomplete-provenance warning alongside the document and shows the degraded badge (#1336)', () => {
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'read-report-incomplete',
          session_id: 's',
          name: 'fs_read_file',
          state: 'succeeded',
          presentation: {
            action: 'Read',
            subject: 'file-link',
            summary: '',
            status: 'degraded',
            blocks: [
              {
                id: 'file-link',
                type: 'link',
                target: 'file',
                uri: 'D:\\workspace\\report.md',
                label: 'report.md',
              },
              { id: 'body', type: 'text', text: 'Report body content unique-marker-xyz' },
              {
                id: 'provenance-incomplete',
                type: 'text',
                severity: 'warning',
                text: 'One input file could not be resolved.',
              },
            ],
          },
        }}
      />,
    );
    expect(container.querySelectorAll('[data-slot="tool-result-panel"]')).toHaveLength(2);
    expect(screen.getByText('Report body content unique-marker-xyz')).toBeVisible();
    expect(screen.getByText('One input file could not be resolved.')).toBeVisible();
    expect(screen.getByText('Degraded')).toBeVisible();
  });
  it('wraps qualifying result details instead of clipping them in a narrow pane', () => {
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'rejected-artifact',
          session_id: 's',
          name: 'create_artifact',
          state: 'succeeded',
          duration_ms: 369,
          presentation: {
            action: 'Create Artifact',
            summary: 'rejected: escapes_root',
            blocks: [],
          },
        }}
      />,
    );
    const metadata = container.querySelector('[data-slot="activity-row"]')?.children[1]
      ?.firstElementChild;
    expect(metadata).toHaveClass('items-center');
    expect(screen.getByText('rejected: escapes_root')).toHaveClass(
      'whitespace-pre-wrap',
      '[overflow-wrap:anywhere]',
    );
  });
  it('renders declared media rather than binary text and rejects active MIME content', () => {
    const { rerender } = render(
      <ClioToolInvocation
        tool={{
          id: 'call',
          session_id: 's',
          name: 'anything',
          state: 'succeeded',
          presentation: {
            summary: '',
            blocks: [
              {
                id: 'image',
                type: 'media',
                media_type: 'image/png',
                text: 'AAAA',
                label: 'Preview image',
              },
            ],
          },
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Preview image' })).toHaveAttribute(
      'src',
      'data:image/png;base64,AAAA',
    );
    expect(screen.queryByText('AAAA')).not.toBeInTheDocument();
    rerender(
      <ClioToolInvocation
        tool={{
          id: 'call',
          session_id: 's',
          name: 'anything',
          state: 'succeeded',
          presentation: {
            summary: '',
            blocks: [{ id: 'image', type: 'media', media_type: 'text/html', text: 'AAAA' }],
          },
        }}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable for text/html.')).toBeVisible();
  });
  it('opens technical JSON in a separate accessible dialog from the row icon', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'call',
          session_id: 's',
          name: 'arbitrary',
          state: 'succeeded',
          input: { exact: 'argument' },
          output: { raw: 'value' },
        }}
      />,
    );
    const icon = screen.getByRole('button', { name: 'Technical details for arbitrary' });
    expect(container).not.toHaveTextContent('argument');
    await user.click(icon);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Arguments' })).toBeVisible();
    expect(container.querySelector('[data-slot="tool-activity"]')).not.toContainElement(dialog);
    await user.keyboard('{Escape}');
    expect(icon).toHaveFocus();
  });
  it('renders declared checklist states without status-word or tool-name inference', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'call',
          session_id: 's',
          name: 'arbitrary',
          state: 'succeeded',
          presentation: {
            summary: '',
            blocks: [
              { id: 'a', type: 'check', state: 'pending', text: 'First task' },
              { id: 'b', type: 'check', state: 'in_progress', text: 'Second task' },
              { id: 'c', type: 'check', state: 'completed', text: 'Third task' },
            ],
          },
        }}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Pending' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'In progress' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Completed' })).toBeInTheDocument();
  });
});
