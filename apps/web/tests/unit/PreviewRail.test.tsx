/**
 * B3 — side-by-side preview rail. Covers the pure tree/classify helpers plus
 * the component render across text / image / binary / empty / error states and
 * the persisted-width clamp wiring.
 */
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PreviewRail,
  buildTree,
  flattenVisible,
  classifyPreview,
  imageFailureHint,
} from '../../src/components/PreviewRail.js';
import type { ContextFileContent, WorkspaceFileEntry } from '@clio/core';

afterEach(cleanup);

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

/** Minimal client double exposing only the two methods the rail uses. */
function makeClient(opts: {
  entries?: WorkspaceFileEntry[];
  listError?: boolean;
  read?: Record<string, ContextFileContent>;
  readError?: boolean;
}) {
  return {
    listWorkspaceFiles: async (_wid: string) => {
      if (opts.listError) throw new Error('boom');
      return { entries: opts.entries ?? [] };
    },
    readWorkspaceFile: async (_wid: string, path: string) => {
      if (opts.readError) throw new Error('boom');
      const c = opts.read?.[path];
      if (!c) throw new Error('not found');
      return c;
    },
  };
}

// Windows-native separators come back from clio on a Windows host — the tree
// builder must handle both '\' and '/'.
const SAMPLE: WorkspaceFileEntry[] = [
  { path: 'src', type: 'dir' },
  { path: 'src\\app.ts', type: 'file', size: 120 },
  { path: 'src/util/helpers.ts', type: 'file', size: 30 },
  { path: 'README.md', type: 'file', size: 64 },
  { path: 'logo.png', type: 'file', size: 2048 },
];

describe('buildTree', () => {
  it('nests files under synthesized + explicit dirs, sorted dirs-first', () => {
    const tree = buildTree(SAMPLE);
    const names = tree.map((n) => n.name);
    // dirs first (src), then files alphabetically
    // localeCompare collates case-insensitively → logo.png before README.md.
    expect(names).toEqual(['src', 'logo.png', 'README.md']);
    const src = tree.find((n) => n.name === 'src')!;
    expect(src.type).toBe('dir');
    // 'util' dir was synthesized from src/util/helpers.ts, plus app.ts file
    const childNames = src.children.map((c) => c.name);
    expect(childNames).toEqual(['util', 'app.ts']);
    const util = src.children.find((c) => c.name === 'util')!;
    expect(util.children[0]?.path).toBe('src/util/helpers.ts');
  });
});

describe('flattenVisible', () => {
  it('only shows top-level rows when nothing is expanded', () => {
    const tree = buildTree(SAMPLE);
    const rows = flattenVisible(tree, new Set(), '');
    expect(rows.map((r) => r.node.name)).toEqual([
      'src',
      'logo.png',
      'README.md',
    ]);
  });

  it('expands a dir to reveal its children at depth+1', () => {
    const tree = buildTree(SAMPLE);
    const rows = flattenVisible(tree, new Set(['src']), '');
    const src = rows.find((r) => r.node.name === 'src')!;
    const app = rows.find((r) => r.node.name === 'app.ts')!;
    expect(app.depth).toBe(src.depth + 1);
  });

  it('filtering matches files by path and force-expands ancestors', () => {
    const tree = buildTree(SAMPLE);
    const rows = flattenVisible(tree, new Set(), 'helpers');
    const names = rows.map((r) => r.node.name);
    expect(names).toContain('helpers.ts');
    expect(names).toContain('util'); // ancestor shown
    expect(names).not.toContain('logo.png'); // non-matching pruned
  });
});

describe('classifyPreview', () => {
  const base = { path: 'x', size: 10, encoding: 'base64' as const, data: '' };
  it('classifies images', () => {
    expect(classifyPreview({ ...base, media_type: 'image/png' })).toBe('image');
  });
  it('classifies text/code', () => {
    expect(classifyPreview({ ...base, media_type: 'text/plain' })).toBe('text');
    expect(
      classifyPreview({ ...base, media_type: 'application/json' }),
    ).toBe('text');
  });
  it('classifies unknown binary', () => {
    expect(
      classifyPreview({ ...base, media_type: 'application/pdf' }),
    ).toBe('binary');
  });
  it('treats oversized text as binary (too large to render inline)', () => {
    expect(
      classifyPreview({
        ...base,
        media_type: 'text/plain',
        size: 2 * 1024 * 1024,
      }),
    ).toBe('binary');
  });
});

describe('PreviewRail component', () => {
  it('shows a no-workspace empty state when workspaceId is undefined', () => {
    render(() => (
      <PreviewRail
        client={makeClient({})}
        workspaceId={undefined}
        onClose={() => undefined}
      />
    ));
    expect(screen.getByTestId('preview-rail-no-workspace').textContent).toContain(
      'Select a session to browse workspace files.',
    );
  });

  it('renders the file browser from a listing', async () => {
    render(() => (
      <PreviewRail
        client={makeClient({ entries: SAMPLE })}
        workspaceId="ws_default"
        onClose={() => undefined}
      />
    ));
    await waitFor(() =>
      expect(screen.getByTestId('preview-rail-row-README.md')).toBeTruthy(),
    );
    expect(screen.getByTestId('preview-rail-row-src')).toBeTruthy();
  });

  it('previews a markdown file as rendered markdown on click', async () => {
    const client = makeClient({
      entries: SAMPLE,
      read: {
        'README.md': {
          path: 'README.md',
          size: 11,
          media_type: 'text/plain',
          encoding: 'base64',
          data: b64('hello world'),
        },
      },
    });
    render(() => (
      <PreviewRail
        client={client}
        workspaceId="ws_default"
        onClose={() => undefined}
      />
    ));
    await waitFor(() =>
      screen.getByTestId('preview-rail-row-README.md'),
    );
    fireEvent.click(screen.getByTestId('preview-rail-row-README.md'));
    await waitFor(() => {
      const md = screen.getByTestId('preview-rail-markdown');
      expect(md.textContent).toContain('hello world');
    });
  });

  it('previews an image as an <img> data URL', async () => {
    const client = makeClient({
      entries: SAMPLE,
      read: {
        'logo.png': {
          path: 'logo.png',
          size: 2048,
          media_type: 'image/png',
          encoding: 'base64',
          data: TINY_PNG,
        },
      },
    });
    render(() => (
      <PreviewRail
        client={client}
        workspaceId="ws_default"
        onClose={() => undefined}
      />
    ));
    await waitFor(() => screen.getByTestId('preview-rail-row-logo.png'));
    fireEvent.click(screen.getByTestId('preview-rail-row-logo.png'));
    await waitFor(() => {
      const img = screen.getByTestId('preview-rail-image').querySelector('img');
      expect(img?.getAttribute('src')).toContain('data:image/png;base64,');
    });
  });

  it('surfaces image decode failures instead of leaving a broken preview', async () => {
    const client = makeClient({
      entries: SAMPLE,
      read: {
        'logo.png': {
          path: 'logo.png',
          size: 16,
          media_type: 'image/png',
          encoding: 'base64',
          data: b64('not a png'),
        },
      },
    });
    render(() => (
      <PreviewRail
        client={client}
        workspaceId="ws_default"
        onClose={() => undefined}
      />
    ));
    await waitFor(() => screen.getByTestId('preview-rail-row-logo.png'));
    fireEvent.click(screen.getByTestId('preview-rail-row-logo.png'));
    const img = await waitFor(() =>
      screen.getByTestId('preview-rail-image').querySelector('img'),
    );
    fireEvent.error(img!);
    await waitFor(() => {
      expect(screen.getByTestId('preview-rail-image-error').textContent).toContain(
        'Could not render image bytes.',
      );
      expect(screen.getByTestId('preview-rail-image-error').textContent).toContain(
        'read size differs from the file listing',
      );
    });
  });

  it('explains image decode failures caused by JSON/text payloads or transformed bytes', () => {
    const content: ContextFileContent = {
      path: 'plot.png',
      size: 84,
      media_type: 'image/png',
      encoding: 'base64',
      data: b64('{"error":"not raw image bytes"}'),
    };

    expect(imageFailureHint(content, 68)).toContain('JSON/text');
    expect(imageFailureHint(content, 68)).toContain('84 B read, 68 B listed');
  });

  it('explains binary image reads transformed by a text/plain backend response', () => {
    const content: ContextFileContent = {
      path: 'plot.png',
      size: 84,
      media_type: 'image/png',
      source_media_type: 'text/plain',
      encoding: 'base64',
      data: b64('\u{fffd}PNG\r\n'),
    };

    expect(imageFailureHint(content, 68)).toContain(
      'Backend read returned text/plain for a image/png file',
    );
    expect(imageFailureHint(content, 68)).toContain('transformed the bytes');
  });

  it('shows an honest placeholder for binary files', async () => {
    const client = makeClient({
      entries: [{ path: 'blob.pdf', type: 'file', size: 999 }],
      read: {
        'blob.pdf': {
          path: 'blob.pdf',
          size: 999,
          media_type: 'application/pdf',
          encoding: 'base64',
          data: '',
        },
      },
    });
    render(() => (
      <PreviewRail
        client={client}
        workspaceId="ws_default"
        onClose={() => undefined}
      />
    ));
    await waitFor(() => screen.getByTestId('preview-rail-row-blob.pdf'));
    fireEvent.click(screen.getByTestId('preview-rail-row-blob.pdf'));
    await waitFor(() => {
      expect(screen.getByTestId('preview-rail-binary').textContent).toContain(
        'application/pdf',
      );
    });
  });

  it('surfaces a list-error state', async () => {
    render(() => (
      <PreviewRail
        client={makeClient({ listError: true })}
        workspaceId="ws_default"
        onClose={() => undefined}
      />
    ));
    await waitFor(() =>
      expect(screen.getByTestId('preview-rail-list-error')).toBeTruthy(),
    );
  });

  it('surfaces a read-error state', async () => {
    const client = makeClient({
      entries: [{ path: 'a.txt', type: 'file' }],
      readError: true,
    });
    render(() => (
      <PreviewRail
        client={client}
        workspaceId="ws_default"
        onClose={() => undefined}
      />
    ));
    await waitFor(() => screen.getByTestId('preview-rail-row-a.txt'));
    fireEvent.click(screen.getByTestId('preview-rail-row-a.txt'));
    await waitFor(() =>
      expect(screen.getByTestId('preview-rail-read-error')).toBeTruthy(),
    );
  });

  it('filters the browser via the search input', async () => {
    render(() => (
      <PreviewRail
        client={makeClient({ entries: SAMPLE })}
        workspaceId="ws_default"
        onClose={() => undefined}
      />
    ));
    await waitFor(() => screen.getByTestId('preview-rail-row-README.md'));
    fireEvent.input(screen.getByTestId('preview-rail-filter'), {
      target: { value: 'helpers' },
    });
    await waitFor(() => {
      expect(screen.queryByTestId('preview-rail-row-logo.png')).toBeNull();
      expect(
        screen.getByTestId('preview-rail-row-src/util/helpers.ts'),
      ).toBeTruthy();
    });
  });

  it('refreshes the workspace file listing on demand', async () => {
    let entries: WorkspaceFileEntry[] = [
      { path: 'before.txt', type: 'file', size: 4 },
    ];
    const client = {
      listWorkspaceFiles: async (_wid: string) => ({ entries }),
      readWorkspaceFile: async (_wid: string, path: string) => ({
        path,
        size: 4,
        media_type: 'text/plain',
        encoding: 'base64' as const,
        data: b64(path),
      }),
    };
    render(() => (
      <PreviewRail
        client={client}
        workspaceId="ws_default"
        onClose={() => undefined}
      />
    ));
    await waitFor(() => screen.getByTestId('preview-rail-row-before.txt'));
    expect(screen.queryByTestId('preview-rail-row-after.txt')).toBeNull();

    entries = [...entries, { path: 'after.txt', type: 'file', size: 4 }];
    fireEvent.click(screen.getByTestId('preview-rail-refresh'));

    await waitFor(() => screen.getByTestId('preview-rail-row-after.txt'));
  });

  it('persists the open flag through the shared persisted-pref helper', async () => {
    // The rail open/closed state is owned by ChatScreen via the same
    // createPersistedBoolean used app-wide. Exercise that contract here so
    // the persistence path the rail relies on is covered.
    const { createPersistedBoolean } = await import('../../src/persisted.js');
    const KEY = 'clio.preview-rail-open.v1.test';
    window.localStorage.removeItem(KEY);
    const [open, setOpen] = createPersistedBoolean(KEY, false);
    expect(open()).toBe(false);
    setOpen(true);
    expect(window.localStorage.getItem(KEY)).toBe('true');
    // A fresh signal rehydrates from storage.
    const [reopened] = createPersistedBoolean(KEY, false);
    expect(reopened()).toBe(true);
    window.localStorage.removeItem(KEY);
  });

  it('declares a clamp-backed width that yields to chat', () => {
    render(() => (
      <PreviewRail
        client={makeClient({})}
        workspaceId={undefined}
        onClose={() => undefined}
      />
    ));
    const rail = screen.getByTestId('preview-rail') as HTMLElement;
    // The width is driven by the host --preview-rail-w var (defined on .chat
    // as a clamp) with a clamp fallback baked into preview-rail.css. The
    // element opts into that system via its class — assert the contract.
    expect(rail.className).toContain('preview-rail');
  });

  it('adopts an externally driven path (Inspector click bonus)', async () => {
    let setPath: (p: string) => void = () => undefined;
    const client = makeClient({
      entries: SAMPLE,
      read: {
        'README.md': {
          path: 'README.md',
          size: 5,
          media_type: 'text/plain',
          encoding: 'base64',
          data: b64('docs!'),
        },
      },
    });
    const { createSignal } = await import('solid-js');
    const [path, setter] = createSignal<string | undefined>(undefined);
    setPath = setter;
    render(() => (
      <PreviewRail
        client={client}
        workspaceId="ws_default"
        externalPath={path}
        onClose={() => undefined}
      />
    ));
    await waitFor(() => screen.getByTestId('preview-rail-row-README.md'));
    setPath('README.md');
    await waitFor(() =>
      expect(screen.getByTestId('preview-rail-markdown').textContent).toContain(
        'docs!',
      ),
    );
  });
});
