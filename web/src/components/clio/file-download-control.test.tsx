import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileTextIcon } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { FileDownloadControl } from './file-download-control';
import { DocumentDownloadActions } from './document-download-actions';
import { FileViewerActionRegistry, type FileViewerAction } from './file-viewer-action-context';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrap(children: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>);
}

it.each([
  ['report.md', 'text/markdown', 'Markdown'],
  [
    'report.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Word',
  ],
  ['report.pdf', 'application/pdf', 'PDF'],
  ['stations.csv', 'text/csv', 'CSV'],
  ['figure.png', 'image/png', 'PNG'],
  ['dashboard.json', 'application/json', 'JSON'],
])(
  'always downloads the original %s before offering alternate formats',
  async (name, mediaType, label) => {
    const original = vi.fn(async () => {});
    const pdf = vi.fn(async () => {});
    const user = userEvent.setup();
    wrap(
      <FileDownloadControl
        name={name}
        mediaType={mediaType}
        onDownload={original}
        formats={[{ kind: 'download', label: 'PDF copy', icon: FileTextIcon, onSelect: pdf }]}
      />,
    );
    const group = screen.getByRole('group', { name: 'File download' });
    const controls = within(group).getAllByRole('button');
    expect(controls[0]).toHaveAccessibleName(`Download ${label}`);
    expect(controls[1]).toHaveAccessibleName('Export to…');
    await user.click(controls[0]);
    await waitFor(() => expect(original).toHaveBeenCalledOnce());
    expect(pdf).not.toHaveBeenCalled();
    await user.click(controls[1]);
    await user.click(screen.getByRole('menuitem', { name: 'PDF copy' }));
    await waitFor(() => expect(pdf).toHaveBeenCalledOnce());
    expect(original).toHaveBeenCalledOnce();
  },
);

it('does not invent conversion choices and exposes unavailable originals', () => {
  wrap(
    <FileDownloadControl name="figure.png" mediaType="image/png" onDownload={vi.fn()} disabled />,
  );
  expect(screen.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Export to…' })).toBeNull();
});

it('disables pending exports, reports failure, and keeps original download semantics', async () => {
  const original = vi.fn(async () => {});
  let reject!: (error: Error) => void;
  const pdf = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  const user = userEvent.setup();
  wrap(
    <FileDownloadControl
      name="report.md"
      mediaType="text/markdown"
      onDownload={original}
      formats={[
        { kind: 'download', label: 'PDF', icon: FileTextIcon, onSelect: pdf },
        { label: 'Unsupported', icon: FileTextIcon, disabled: true, onSelect: vi.fn() },
      ]}
    />,
  );
  const exportButton = screen.getByRole('button', { name: 'Export to…' });
  exportButton.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('menuitem', { name: 'Unsupported' })).toHaveAttribute('data-disabled');
  await user.click(screen.getByRole('menuitem', { name: 'PDF' }));
  await waitFor(() => expect(exportButton).toBeDisabled());
  reject(new Error('Conversion unavailable'));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Conversion unavailable'));
  await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
  expect(original).toHaveBeenCalledOnce();
});

it('contributes conversions to the shared registry without creating a competing control', async () => {
  const register = vi.fn();
  const pdf = vi.fn(async () => {});
  const source = vi.fn(async () => {});
  const { rerender } = wrap(
    <FileViewerActionRegistry.Provider value={register}>
      <DocumentDownloadActions
        name="report.md"
        mediaType="text/markdown"
        pdf
        pdfPending={false}
        onPdf={pdf}
        onDownload={source}
      />
    </FileViewerActionRegistry.Provider>,
  );
  expect(screen.queryByRole('button')).toBeNull();
  const actions = register.mock.calls.find(([, value]) =>
    Array.isArray(value),
  )?.[1] as FileViewerAction[];
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ kind: 'download', label: 'PDF' });
  await actions[0].onSelect();
  expect(pdf).toHaveBeenCalledOnce();
  expect(source).not.toHaveBeenCalled();
  rerender(
    <QueryClientProvider client={new QueryClient()}>
      <FileViewerActionRegistry.Provider value={register}>
        <DocumentDownloadActions
          name="report.pdf"
          mediaType="application/pdf"
          pdf={false}
          pdfPending={false}
          onPdf={pdf}
          onDownload={source}
        />
      </FileViewerActionRegistry.Provider>
    </QueryClientProvider>,
  );
  expect(register.mock.calls.at(-1)?.[1]).toEqual([]);
});
