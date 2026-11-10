import { HOST_SOURCE, VIEWER_SOURCE } from '@clio/hdf5-viewer/protocol';
import { TransportError } from '@clio/core/v3';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FileViewerContentsRegistry } from './file-viewer-action-context';
import { FileViewerFactsRegistry } from './file-viewer-facts';
import { entityFacts, valuesAsTsv } from './hdf5-viewer-facts';
import { Hdf5ViewerFrame } from './hdf5-viewer-frame';
import { HDF5_VIEWER_PATH } from './hdf5-viewer-location';

const repository = vi.hoisted(() => ({ readWorkspaceHdf5: vi.fn() }));
const theme = vi.hoisted(() => ({ resolvedTheme: 'dark' as 'dark' | 'light' }));
/** The desktop viewer origin's base URL, or undefined for the web app. */
const desktop = vi.hoisted(() => ({ base: undefined as string | undefined }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
// A named theme (Notebook) still maps to its light or dark variant.
vi.mock('@/theme/runtime', () => ({ useThemeKey: () => `notebook:${theme.resolvedTheme}` }));
vi.mock('./hdf5-viewer-location', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hdf5-viewer-location')>();
  return {
    ...actual,
    currentViewerLocation: () => actual.viewerLocation(window.location.origin, desktop.base),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  desktop.base = undefined;
});

type FrameHost = {
  setFacts: ReturnType<typeof vi.fn<(id: string, facts?: readonly string[]) => void>>;
  setContents: ReturnType<typeof vi.fn<(id: string, read?: () => unknown) => void>>;
};

/** Render the frame and capture what it posts to the iframe window. */
function renderFrame(
  props: Partial<Parameters<typeof Hdf5ViewerFrame>[0]> = {},
  frame?: FrameHost,
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TooltipProvider>
      <FileViewerFactsRegistry.Provider value={frame?.setFacts}>
        <FileViewerContentsRegistry.Provider value={frame?.setContents}>
          {children}
        </FileViewerContentsRegistry.Provider>
      </FileViewerFactsRegistry.Provider>
    </TooltipProvider>
  );
  const view = render(
    <Hdf5ViewerFrame path="runs/water.h5" workspaceId="workspace_1" {...props} />,
    { wrapper },
  );
  const iframe = view.container.querySelector('iframe');
  if (!iframe?.contentWindow) throw new Error('iframe not rendered');
  const frameWindow = iframe.contentWindow;
  const posted = vi.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
  const send = (data: unknown, origin = window.location.origin, source: unknown = frameWindow) =>
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
    });
  return { view, iframe, posted, send };
}

function lastMessage(posted: ReturnType<typeof vi.spyOn>) {
  return posted.mock.calls.at(-1)?.[0];
}

describe('Hdf5ViewerFrame', () => {
  it('loads the viewer page', () => {
    const { iframe } = renderFrame();
    expect(iframe.getAttribute('src')).toBe(`/${HDF5_VIEWER_PATH}`);
    expect(iframe.title).toBe('HDF5 viewer: runs/water.h5');
  });

  it('answers ready with the file and initial locator', () => {
    const { posted, send } = renderFrame({ locator: '/entry/data' });
    send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 });
    expect(posted).toHaveBeenCalledWith(
      {
        source: HOST_SOURCE,
        type: 'init',
        protocol: 1,
        filepath: 'runs/water.h5',
        locator: '/entry/data',
        revision: 0,
        theme: 'dark',
      },
      window.location.origin,
      [],
    );
  });

  it('re-sends init when the locator or revision changes after ready', () => {
    const { view, posted, send } = renderFrame();
    send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 });
    view.rerender(
      <Hdf5ViewerFrame
        locator="/entry/I"
        path="runs/water.h5"
        revision={1}
        workspaceId="workspace_1"
      />,
    );
    expect(lastMessage(posted)).toMatchObject({ type: 'init', locator: '/entry/I', revision: 1 });
  });

  it('sends the app theme and re-sends init when it changes', () => {
    const { view, posted, send } = renderFrame();
    send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 });
    expect(lastMessage(posted)).toMatchObject({ type: 'init', theme: 'dark' });

    theme.resolvedTheme = 'light';
    view.rerender(<Hdf5ViewerFrame path="runs/water.h5" workspaceId="workspace_1" />);
    expect(lastMessage(posted)).toMatchObject({ type: 'init', theme: 'light' });
    theme.resolvedTheme = 'dark';
  });

  it('serves fetches through the repository and pins the file', async () => {
    repository.readWorkspaceHdf5.mockResolvedValue(new Uint8Array([7, 8, 9]));
    const { posted, send } = renderFrame();
    send({
      source: VIEWER_SOURCE,
      type: 'fetch',
      id: 4,
      endpoint: 'data',
      // The viewer cannot redirect the read to another file.
      params: { file: '../secrets.h5', path: '/entry/I', selection: '0:3' },
    });

    expect(repository.readWorkspaceHdf5).toHaveBeenCalledWith(
      'workspace_1',
      'data',
      { file: 'runs/water.h5', path: '/entry/I', selection: '0:3' },
      expect.any(AbortSignal),
    );
    await vi.waitFor(() =>
      expect(lastMessage(posted)).toMatchObject({ type: 'response', id: 4, ok: true }),
    );
    const [message, , transfer] = posted.mock.calls.at(-1) as unknown as [
      { body: ArrayBuffer },
      string,
      Transferable[],
    ];
    expect([...new Uint8Array(message.body)]).toEqual([7, 8, 9]);
    expect(transfer).toEqual([message.body]);
  });

  it('forwards transport errors with their status', async () => {
    repository.readWorkspaceHdf5.mockRejectedValue(
      new TransportError('/nope is not a valid path in water.h5', 404),
    );
    const { posted, send } = renderFrame();
    send({
      source: VIEWER_SOURCE,
      type: 'fetch',
      id: 1,
      endpoint: 'meta',
      params: { path: '/nope' },
    });
    await vi.waitFor(() =>
      expect(lastMessage(posted)).toEqual({
        source: HOST_SOURCE,
        type: 'response',
        id: 1,
        ok: false,
        status: 404,
        message: '/nope is not a valid path in water.h5',
      }),
    );
  });

  it('aborts the repository read when the viewer cancels', () => {
    repository.readWorkspaceHdf5.mockReturnValue(new Promise(() => undefined));
    const { send } = renderFrame();
    send({ source: VIEWER_SOURCE, type: 'fetch', id: 2, endpoint: 'data', params: {} });
    const signal = repository.readWorkspaceHdf5.mock.calls[0]?.[3] as AbortSignal;
    expect(signal.aborted).toBe(false);
    send({ source: VIEWER_SOURCE, type: 'abort', id: 2 });
    expect(signal.aborted).toBe(true);
  });

  it('aborts in-flight reads on unmount', () => {
    repository.readWorkspaceHdf5.mockReturnValue(new Promise(() => undefined));
    const { view, send } = renderFrame();
    send({ source: VIEWER_SOURCE, type: 'fetch', id: 3, endpoint: 'meta', params: {} });
    const signal = repository.readWorkspaceHdf5.mock.calls[0]?.[3] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it('reports selections', () => {
    const onSelect = vi.fn();
    const { send } = renderFrame({ onSelect });
    send({ source: VIEWER_SOURCE, type: 'select', locator: '/entry/I' });
    expect(onSelect).toHaveBeenCalledWith('/entry/I');
  });

  it('reopens at the last selection when the canvas remounts the viewer', () => {
    const first = renderFrame({ path: 'remount/a.h5' });
    first.send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 });
    first.send({ source: VIEWER_SOURCE, type: 'select', locator: '/entry/image' });
    first.view.unmount();

    const second = renderFrame({ path: 'remount/a.h5' });
    second.send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 });
    expect(lastMessage(second.posted)).toMatchObject({ type: 'init', locator: '/entry/image' });
  });

  it('opens a newly requested locator over the remembered one', () => {
    const first = renderFrame({ path: 'remount/b.h5', locator: '/x' });
    first.send({ source: VIEWER_SOURCE, type: 'select', locator: '/y' });
    first.view.unmount();

    const same = renderFrame({ path: 'remount/b.h5', locator: '/x' });
    same.send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 });
    expect(lastMessage(same.posted)).toMatchObject({ locator: '/y' });
    same.view.unmount();

    const other = renderFrame({ path: 'remount/b.h5', locator: '/z' });
    other.send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 });
    expect(lastMessage(other.posted)).toMatchObject({ locator: '/z' });
  });

  it('remembers selections per file', () => {
    const first = renderFrame({ path: 'remount/c.h5' });
    first.send({ source: VIEWER_SOURCE, type: 'select', locator: '/entry' });
    first.view.unmount();

    const other = renderFrame({ path: 'remount/d.h5' });
    other.send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 });
    expect(lastMessage(other.posted)).toMatchObject({ type: 'init', locator: undefined });
  });

  it('keeps working when the iframe is moved and reloads as a new window', () => {
    repository.readWorkspaceHdf5.mockReturnValue(new Promise(() => undefined));
    const { iframe, send } = renderFrame({ path: 'moved/a.h5' });
    send({ source: VIEWER_SOURCE, type: 'fetch', id: 1, endpoint: 'meta', params: {} });
    const staleSignal = repository.readWorkspaceHdf5.mock.calls[0]?.[3] as AbortSignal;

    // The browser gives a moved iframe a new window; this component did not remount.
    const reloaded = { postMessage: vi.fn() };
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, get: () => reloaded });
    send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 }, window.location.origin, reloaded);

    expect(reloaded.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'init', filepath: 'moved/a.h5' }),
      window.location.origin,
      [],
    );
    expect(staleSignal.aborted).toBe(true);
  });

  it('ignores messages from other windows, origins and protocols', () => {
    const onSelect = vi.fn();
    const { send } = renderFrame({ onSelect });
    const select = { source: VIEWER_SOURCE, type: 'select', locator: '/x' };
    send(select, 'https://evil.example');
    send(select, window.location.origin, window);
    send({ ...select, source: 'someone-else' });
    send({ source: VIEWER_SOURCE, type: 'fetch', id: 1, endpoint: 'files', params: {} });
    expect(onSelect).not.toHaveBeenCalled();
    expect(repository.readWorkspaceHdf5).not.toHaveBeenCalled();
  });
});

describe('Hdf5ViewerFrame in the workbench frame', () => {
  function frameHost() {
    return {
      setFacts: vi.fn<(id: string, facts?: readonly string[]) => void>(),
      setContents: vi.fn<(id: string, read?: () => unknown) => void>(),
    } satisfies FrameHost;
  }

  const entity = (fields: Record<string, unknown>) => ({
    source: VIEWER_SOURCE,
    type: 'entity',
    locator: '/entry/image',
    kind: 'dataset',
    ...fields,
  });

  it('shows the open dataset as facts: its path, shape and element type', () => {
    const host = frameHost();
    const { send } = renderFrame({}, host);
    send(entity({ shape: [365, 721, 1440], dtype: 'float32' }));
    expect(host.setFacts).toHaveBeenLastCalledWith(expect.any(String), [
      '/entry/image',
      '365 × 721 × 1440',
      'float32',
    ]);
  });

  it('draws the modes h5web offers as pressed Format icons and asks the viewer to switch', () => {
    const { posted, send } = renderFrame();
    send({
      source: VIEWER_SOURCE,
      type: 'modes',
      modes: ['table', 'image', 'attributes'],
      mode: 'image',
      explorer: true,
    });
    const group = screen.getByRole('group', { name: 'Show as' });
    expect(group.querySelectorAll('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Image' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Table' }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    act(() => screen.getByRole('button', { name: 'Table' }).click());
    expect(lastMessage(posted)).toEqual({ source: HOST_SOURCE, type: 'show', mode: 'table' });
    expect(screen.getByRole('button', { name: 'Table' }).getAttribute('aria-pressed')).toBe('true');

    act(() => screen.getByRole('button', { name: 'Explorer' }).click());
    expect(lastMessage(posted)).toEqual({ source: HOST_SOURCE, type: 'show', explorer: false });
    expect(screen.getByRole('button', { name: 'Explorer' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('returns from Attributes to the display when it is chosen again', () => {
    const { posted, send } = renderFrame();
    send({
      source: VIEWER_SOURCE,
      type: 'modes',
      modes: ['plot', 'attributes'],
      mode: 'attributes',
      explorer: false,
    });
    act(() => screen.getByRole('button', { name: 'Attributes' }).click());
    expect(lastMessage(posted)).toEqual({ source: HOST_SOURCE, type: 'show', mode: 'plot' });
  });

  it('copies a small dataset as tab-separated values', async () => {
    repository.readWorkspaceHdf5.mockResolvedValue(
      new TextEncoder().encode(
        JSON.stringify([
          [1, 2],
          [3, 4],
        ]),
      ),
    );
    const host = frameHost();
    const { send } = renderFrame({}, host);
    send(entity({ shape: [2, 2], dtype: 'float32' }));
    const reader = host.setContents.mock.calls.at(-1)?.[1] as () => Promise<string>;
    await expect(reader()).resolves.toBe('1\t2\n3\t4');
    expect(repository.readWorkspaceHdf5).toHaveBeenCalledWith('workspace_1', 'data', {
      file: 'runs/water.h5',
      path: '/entry/image',
      format: 'json',
    });
  });

  it('copies the reference of a large or many-dimensional dataset', async () => {
    const host = frameHost();
    const { send } = renderFrame({}, host);
    send(entity({ shape: [365, 721, 1440], dtype: 'float32' }));
    const reader = host.setContents.mock.calls.at(-1)?.[1] as () => Promise<string>;
    await expect(reader()).resolves.toBe('runs/water.h5::/entry/image');
    expect(repository.readWorkspaceHdf5).not.toHaveBeenCalled();
  });

  it('ignores malformed modes and entities', () => {
    const host = frameHost();
    const { send } = renderFrame({}, host);
    send({ source: VIEWER_SOURCE, type: 'modes', modes: ['spreadsheet'], explorer: true });
    send(entity({ kind: 'file' }));
    expect(screen.queryByRole('group', { name: 'Show as' })).toBeNull();
    expect(host.setFacts.mock.calls.every(([, facts]) => facts === undefined)).toBe(true);
  });
});

describe('entityFacts and valuesAsTsv', () => {
  it('names a scalar and skips the file root', () => {
    expect(entityFacts({ locator: '/', kind: 'group' })).toEqual([]);
    expect(entityFacts({ locator: '/x', kind: 'dataset', shape: [], dtype: 'int16' })).toEqual([
      '/x',
      'scalar',
      'int16',
    ]);
  });

  it('writes a value, a column and a matrix', () => {
    expect(valuesAsTsv(3.5)).toBe('3.5');
    expect(valuesAsTsv([1, 2])).toBe('1\n2');
    expect(
      valuesAsTsv([
        [1, 2],
        [3, 4],
      ]),
    ).toBe('1\t2\n3\t4');
    expect(valuesAsTsv(null)).toBeUndefined();
  });
});

describe('Hdf5ViewerFrame in the packaged desktop app', () => {
  const viewerOrigin = 'http://gact-viewer.localhost';

  function renderDesktop() {
    desktop.base = `${viewerOrigin}/`;
    return renderFrame();
  }

  it('loads the viewer from its own origin and names this page as the host', () => {
    const { iframe } = renderDesktop();
    expect(iframe.getAttribute('src')).toBe(
      `${viewerOrigin}/hdf5-viewer/index.html?host=${encodeURIComponent(window.location.origin)}`,
    );
  });

  it('talks only to the viewer origin', () => {
    const { posted, send } = renderDesktop();
    send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 });
    expect(posted).not.toHaveBeenCalled();

    send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 }, viewerOrigin);
    expect(posted).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'init', filepath: 'runs/water.h5' }),
      viewerOrigin,
      [],
    );
  });

  it('pins the file even when the viewer names another one', async () => {
    repository.readWorkspaceHdf5.mockResolvedValue(new Uint8Array([1]));
    const { send } = renderDesktop();
    send({ source: VIEWER_SOURCE, type: 'ready', protocol: 1 }, viewerOrigin);
    send(
      {
        source: VIEWER_SOURCE,
        type: 'fetch',
        id: 1,
        endpoint: 'meta',
        params: { file: 'secrets.h5', path: '/' },
      },
      viewerOrigin,
    );
    await act(async () => undefined);
    expect(repository.readWorkspaceHdf5).toHaveBeenCalledWith(
      'workspace_1',
      'meta',
      { file: 'runs/water.h5', path: '/' },
      expect.any(AbortSignal),
    );
  });
});
