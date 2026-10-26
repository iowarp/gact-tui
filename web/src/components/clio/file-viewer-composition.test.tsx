import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EyeIcon } from 'lucide-react';
import type { Artifact, WorkspaceResource } from '@clio/core/v3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '@/lib/clipboard';
import '../ai-elements/markdown';
import { FileTextView } from './file-text-view';
import { FileViewerShell } from './file-viewer-shell';
import type { FileViewerSource } from './file-viewer-source';
import { readFileViewerBytes } from './file-viewer-source';

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => false }));
vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn(async () => {}) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const workspaceId = 'workspace_composition';

it('reads provided bundle source through the common download boundary without a workspace lookup', async () => {
  const bytes = new TextEncoder().encode('# Skill\r\n');
  const source: FileViewerSource = {
    kind: 'provided',
    name: 'SKILL.md',
    mediaType: 'text/markdown',
    origin: 'Plugin source',
    readBytes: async () => bytes,
  };
  expect(await readFileViewerBytes({} as never, source)).toEqual(bytes);
  renderComposition(source, 'SKILL.md', '# Skill\r\n', 'text/markdown');
  expect(await screen.findByRole('button', { name: 'Download Markdown' })).toBeVisible();
});

interface FormatCase {
  name: string;
  mediaType: string;
  content: string;
  modes: readonly string[];
  readableText?: string;
}

const formats: readonly FormatCase[] = [
  {
    name: 'config.json',
    mediaType: 'application/json',
    content: '{\r\n  "server": {\r\n    "transport": "stdio"\r\n  }\r\n}\r\n',
    modes: [],
    readableText: undefined,
  },
  {
    name: 'stations.json',
    mediaType: 'application/json',
    content: '[{"station":"MTA1","count":25},{"station":"MTA2","count":27}]',
    modes: ['Data', 'Source'],
    readableText: 'MTA1',
  },
  {
    name: 'field-notes.md',
    mediaType: 'text/markdown',
    content:
      '# Field notes\n\nPractice **first**.\n\n| Station | Count |\n| --- | --- |\n| MTA1 | 25 |\n',
    modes: ['Read document', 'Source'],
    readableText: 'Field notes',
  },
  {
    name: 'report.html',
    mediaType: 'text/html',
    content: '<!doctype html><html><body><h1>HTML report</h1></body></html>',
    modes: ['HTML preview', 'Source'],
    readableText: undefined,
  },
  {
    name: 'stations.csv',
    mediaType: 'text/csv',
    content: 'station,count\nMTA1,25\nMTA2,27\n',
    modes: ['Data', 'Source'],
    readableText: 'MTA1',
  },
  {
    name: 'analyze.py',
    mediaType: 'text/x-python',
    content: 'def analyze():\n    return "ready"\n',
    modes: [],
    readableText: undefined,
  },
];

const sourceKinds = ['artifact', 'workspace', 'resource'] as const;

function sourceFor(kind: (typeof sourceKinds)[number], name: string, mediaType: string) {
  if (kind === 'artifact') {
    return {
      kind,
      workspaceId,
      artifact: {
        id: `artifact_${name}`,
        session_id: 'session_composition',
        workspace_id: workspaceId,
        name,
        media_type: mediaType,
        size: 128,
        uri: `artifact://${workspaceId}/${name}@v1`,
      } as Artifact,
    } satisfies FileViewerSource;
  }
  if (kind === 'resource') {
    return {
      kind,
      workspaceId,
      resource: {
        id: `resource_${name}`,
        workspace_id: workspaceId,
        client_upload_id: `upload_${name}`,
        revision: 1,
        name,
        claimed_mime: mediaType,
        detected_mime: mediaType,
        detection_source: 'signature',
        declared_size: 128,
        received_size: 128,
        sha256: 'a'.repeat(64),
        state: 'ready',
        failure: '',
        created_at: '2026-10-25T00:00:00Z',
        updated_at: '2026-10-25T00:00:00Z',
        completed_at: '2026-10-25T00:00:00Z',
        mime_mismatch: false,
      } as WorkspaceResource,
    } satisfies FileViewerSource;
  }
  return {
    kind,
    workspaceId,
    path: `results/${name}`,
    mediaType,
    size: 128,
  } satisfies FileViewerSource;
}

function renderComposition(
  source: FileViewerSource,
  name: string,
  content: string,
  mediaType: string,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (
    <FileViewerShell
      source={source}
      tabs={[
        {
          value: 'preview',
          label: 'Preview',
          icon: EyeIcon,
          content: <FileTextView name={name} content={content} mediaType={mediaType} />,
        },
      ]}
    />
  );
  return render(<QueryClientProvider client={client}>{view}</QueryClientProvider>);
}

describe.each(sourceKinds)('shared file viewer composition for %s custody', (kind) => {
  it.each(formats)('$name has one identity and one owning toolbar', async (file) => {
    const { container } = renderComposition(
      sourceFor(kind, file.name, file.mediaType),
      file.name,
      file.content,
      file.mediaType,
    );

    expect(container.querySelectorAll('[data-slot="viewer-toolbar"]')).toHaveLength(1);
    const toolbar = container.querySelector('[data-slot="viewer-toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(
      within(toolbar as HTMLElement).getByRole('button', { name: `Copy ${file.name}` }),
    ).toBeVisible();
    expect(screen.getAllByText(file.name, { exact: true })).toHaveLength(1);

    for (const mode of file.modes) {
      expect(within(toolbar as HTMLElement).getByRole('tab', { name: mode })).toBeVisible();
    }
    if (file.modes.length === 0) {
      expect(within(toolbar as HTMLElement).queryByRole('tab', { name: 'Source' })).toBeNull();
    }
  });

  it.each(formats)(
    '$name keeps exact source in the shared Copy action and has no source-body Copy button',
    async (file) => {
      const user = userEvent.setup();
      const { container } = renderComposition(
        sourceFor(kind, file.name, file.mediaType),
        file.name,
        file.content,
        file.mediaType,
      );
      const toolbar = container.querySelector('[data-slot="viewer-toolbar"]') as HTMLElement;
      const copy = within(toolbar).getByRole('button', { name: `Copy ${file.name}` });

      if (file.readableText !== undefined) {
        expect(await screen.findByText(file.readableText)).toBeVisible();
        await user.click(copy);
        expect(copyText).toHaveBeenCalledWith(expect.stringContaining(file.readableText));
        vi.mocked(copyText).mockClear();
      }

      if (file.modes.includes('Source')) {
        await user.click(within(toolbar).getByRole('tab', { name: 'Source' }));
      }
      const source = await screen.findByRole('region', { name: `Source of ${file.name}` });
      expect(source).toBeVisible();
      expect(source).not.toHaveTextContent(file.name);
      expect(source.querySelector('button')).toBeNull();
      expect(within(toolbar).getByRole('button', { name: `Copy ${file.name}` })).toBeVisible();

      await user.click(copy);
      expect(copyText).toHaveBeenCalledWith(file.content);
    },
  );
});

describe('source mode and file identity edge cases', () => {
  it('treats the historical .json text/html MIME conflict as JSON source, never an HTML iframe', async () => {
    const content = '{\n  "extensionWins": true\n}\n';
    const source = sourceFor('artifact', 'mcp-app.json', 'text/html');
    if (source.kind !== 'artifact') throw new Error('Expected artifact fixture');
    const artifactSource: FileViewerSource = {
      kind: 'artifact',
      workspaceId,
      artifact: {
        ...source.artifact,
        producer: { designation: 'mcp-app' },
      } as Artifact,
    };
    const { container } = renderComposition(artifactSource, 'mcp-app.json', content, 'text/html');
    const toolbar = container.querySelector('[data-slot="viewer-toolbar"]') as HTMLElement;

    expect(within(toolbar).queryByRole('tab', { name: 'HTML preview' })).toBeNull();
    expect(screen.queryByTitle('HTML preview of mcp-app.json')).not.toBeInTheDocument();
    const copy = within(toolbar).getByRole('button', { name: 'Copy mcp-app.json' });
    await userEvent.click(copy);
    expect(copyText).toHaveBeenCalledWith(content);
  });

  it('keeps long logical source rows unwrapped by default', async () => {
    const row = `value = "${'x'.repeat(4_000)}"`;
    const content = `${row}\n`;
    const { container } = renderComposition(
      sourceFor('workspace', 'long-row.py', 'text/x-python'),
      'long-row.py',
      content,
      'text/x-python',
    );
    const source = await screen.findByRole('region', { name: 'Source of long-row.py' });

    expect(source.className).toContain('[&_pre]:whitespace-pre');
    expect(source.className).toContain('[&_pre]:[overflow-wrap:normal]');
    expect(source).toHaveTextContent(row);
    expect(container.querySelectorAll('[data-slot="viewer-toolbar"]')).toHaveLength(1);
  });
});
