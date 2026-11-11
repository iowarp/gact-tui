import type { Artifact, DocumentManifest } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { documentApplications } from '@/tauri/documents';
import { useDocumentOpenActions } from './document-open-menu';
import { FrameOpenButton } from './file-viewer-take';
import { useOpenTake } from './file-viewer-take-hooks';

const host = vi.hoisted(() => ({ native: true }));
const repository = vi.hoisted(() => ({ readArtifactBytesFor: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/hooks/use-open-file-in-browser', () => ({ useOpenFileInBrowser: () => vi.fn() }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => host.native }));
vi.mock('@/tauri/documents', () => ({
  documentApplications: vi.fn(),
  openFileBytes: vi.fn(),
  revealFileBytes: vi.fn(),
}));

const artifact: Artifact = {
  id: 'art',
  workspace_id: 'ws',
  session_id: 'sess',
  name: 'report.md',
  media_type: 'text/markdown',
  uri: 'artifact://report.md',
};
const manifest: DocumentManifest = {
  artifact_id: 'art',
  workspace_id: 'ws',
  name: 'report.md',
  version: 1,
  sha256: 'a'.repeat(64),
  mime_type: 'text/markdown',
  profile: 'markdown',
  content_url: '',
  native_open: true,
  anchors: [],
  rendition_formats: ['pdf'],
  provenance: {},
};
const editor = { id: 'os-editor', name: 'Visual Studio Code', is_default: true };
const viewer = { id: 'os-pdf-app', name: 'Adobe Acrobat', is_default: false };

beforeEach(() => {
  host.native = true;
  vi.mocked(documentApplications).mockImplementation(async (name) =>
    name === 'file.pdf' ? [viewer] : [editor],
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const handlers = () => ({
  onOpen: vi.fn(),
  onReveal: vi.fn(),
  onPdf: vi.fn(async () => undefined),
  onCloseWorkingCopy: vi.fn(),
});

function Harness({
  document,
  options,
  calls,
  workingCopyActive = false,
}: {
  document: Artifact;
  options: DocumentManifest;
  calls: ReturnType<typeof handlers>;
  workingCopyActive?: boolean;
}) {
  const actions = useDocumentOpenActions({
    artifact: document,
    manifest: options,
    openPending: false,
    pdfPending: false,
    revealPending: false,
    workingCopyActive,
    closePending: false,
    ...calls,
  });
  // As the frame splits them: download kinds join Export to…, open kinds the places.
  const take = useOpenTake(
    { kind: 'artifact', artifact: document, workspaceId: 'ws' },
    actions.filter((action) => action.kind === 'download'),
    { otherApps: false, rows: actions.filter((action) => action.kind === 'open') },
  );
  return <FrameOpenButton take={take} />;
}

function menu(
  overrides: Partial<DocumentManifest> = {},
  document: Artifact = artifact,
  workingCopyActive = false,
) {
  const calls = handlers();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider>
        <Harness
          calls={calls}
          document={document}
          options={{ ...manifest, ...overrides }}
          workingCopyActive={workingCopyActive}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return calls;
}

async function submenu(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('button', { name: 'Open options' }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

it('lists the original apps in the one Open ▾ and opens a working copy', async () => {
  const calls = menu();
  const user = userEvent.setup();
  await submenu(user, /^With another app/u);
  expect(screen.getAllByRole('menuitem', { name: /^With another app/u })).toHaveLength(1);
  // Pointer travel between the trigger and the submenu has no geometry in jsdom.
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Visual Studio Code (default)' }));
  expect(calls.onOpen).toHaveBeenCalledWith({
    kind: 'native',
    application: editor,
    format: 'original',
  });
});

it('keeps the PDF apps in their own row', async () => {
  const calls = menu();
  const user = userEvent.setup();
  await submenu(user, /^PDF copy with another app/u);
  const acrobat = await screen.findByRole('menuitem', { name: 'Adobe Acrobat' });
  expect(acrobat).toHaveAttribute('title', 'Open a PDF copy in Adobe Acrobat');
  fireEvent.click(acrobat);
  expect(calls.onOpen).toHaveBeenCalledWith({ kind: 'native', application: viewer, format: 'pdf' });
});

it.each([
  'html-static',
  'markdown',
  'latex',
  'pdf',
  'ooxml-word',
  'odf-text',
  'ooxml-sheet',
  'odf-sheet',
  'ooxml-slides',
  'odf-slides',
  'binary',
] as const)('uses OS handlers for %s instead of guessed Office apps', async (profile) => {
  menu({ profile });
  const user = userEvent.setup();
  await submenu(user, /^With another app/u);
  expect(
    await screen.findByRole('menuitem', { name: 'Visual Studio Code (default)' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('menuitem', { name: /Word|Excel|PowerPoint|ONLYOFFICE|Collabora/u }),
  ).toBeNull();
  expect(screen.queryByRole('menuitem', { name: /^PDF copy with another app/u }) !== null).toBe(
    profile !== 'pdf',
  );
  expect(screen.queryByRole('menuitem', { name: /^Export to PDF/u }) !== null).toBe(
    profile !== 'pdf',
  );
});

it('exports the PDF copy, leaving the original download to the frame', async () => {
  const calls = menu();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open options' }));
  expect(await screen.findByRole('menuitem', { name: /^Export to PDF/u })).toBeVisible();
  expect(
    screen.queryByRole('menuitem', { name: /^Download(?! with evidence)/u }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: /^Export to PDF/u }));
  await waitFor(() => expect(calls.onPdf).toHaveBeenCalledOnce());
});

it('offers no installed apps in a browser', async () => {
  host.native = false;
  menu();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open options' }));
  expect(await screen.findByRole('menuitem', { name: /^Export to PDF/u })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: /with another app/iu })).toBeNull();
  expect(documentApplications).not.toHaveBeenCalled();
});

it('shows a pending association lookup explicitly', async () => {
  vi.mocked(documentApplications).mockImplementation(() => new Promise(() => undefined));
  menu();
  const user = userEvent.setup();
  await submenu(user, /^With another app/u);
  expect(await screen.findByRole('menuitem', { name: 'Finding apps…' })).toHaveAttribute(
    'data-disabled',
  );
});

it('keeps the folder when the document cannot be edited in an app', async () => {
  const calls = menu({ profile: 'binary', native_open: false, rendition_formats: [] });
  const user = userEvent.setup();
  await submenu(user, /^With another app/u);
  expect(screen.queryByRole('menuitem', { name: /Visual Studio Code/u })).toBeNull();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Open in folder' }));
  expect(calls.onReveal).toHaveBeenCalledOnce();
});

it('closes an open working copy from Open ▾', async () => {
  const calls = menu({}, artifact, true);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open options' }));
  await user.click(await screen.findByRole('menuitem', { name: /^Close working copy/u }));
  await waitFor(() => expect(calls.onCloseWorkingCopy).toHaveBeenCalledOnce());
});
