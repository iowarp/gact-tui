import { AbortError } from '@h5web/app';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostBridge, createExportURL, endpointOf, observeSelection } from './bridge';
import { HOST_SOURCE, VIEWER_SOURCE, isHostMessage, isViewerMessage } from './protocol';

const ORIGIN = 'http://127.0.0.1:5173';

function bridge() {
  const postMessage = vi.fn();
  return { bridge: new HostBridge({ postMessage }, ORIGIN), postMessage };
}

function lastPosted(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls.at(-1)?.[0];
}

describe('HostBridge.fetcher', () => {
  it('posts a fetch message and resolves with the host response', async () => {
    const { bridge: b, postMessage } = bridge();
    const result = b.fetcher('/data', { file: 'run.h5', path: '/I', format: 'bin' });

    const request = lastPosted(postMessage);
    expect(postMessage).toHaveBeenCalledWith(request, ORIGIN);
    expect(request).toEqual({
      source: VIEWER_SOURCE,
      type: 'fetch',
      id: 1,
      endpoint: 'data',
      params: { file: 'run.h5', path: '/I', format: 'bin' },
    });
    expect(isViewerMessage(request)).toBe(true);

    const body = new Uint8Array([1, 2, 3]).buffer;
    b.receive({ source: HOST_SOURCE, type: 'response', id: 1, ok: true, body });
    await expect(result).resolves.toBe(body);
  });

  it('rejects with the host error message', async () => {
    const { bridge: b } = bridge();
    const result = b.fetcher('/meta', { file: 'run.h5', path: '/nope' });
    b.receive({
      source: HOST_SOURCE,
      type: 'response',
      id: 1,
      ok: false,
      status: 404,
      message: '/nope is not a valid path in run.h5',
    });
    await expect(result).rejects.toThrow('/nope is not a valid path in run.h5');
  });

  it('matches responses to requests by id', async () => {
    const { bridge: b } = bridge();
    const first = b.fetcher('/meta', { path: '/a' });
    const second = b.fetcher('/meta', { path: '/b' });
    const a = new Uint8Array([1]).buffer;
    const bBody = new Uint8Array([2]).buffer;
    b.receive({ source: HOST_SOURCE, type: 'response', id: 2, ok: true, body: bBody });
    b.receive({ source: HOST_SOURCE, type: 'response', id: 1, ok: true, body: a });
    await expect(first).resolves.toBe(a);
    await expect(second).resolves.toBe(bBody);
  });

  it('posts abort and rejects with an AbortError when h5web cancels', async () => {
    const { bridge: b, postMessage } = bridge();
    const controller = new AbortController();
    const result = b.fetcher('/data', { path: '/I' }, { abortSignal: controller.signal });
    controller.abort(new AbortError('cancelled'));

    await expect(result).rejects.toBeInstanceOf(AbortError);
    expect(lastPosted(postMessage)).toEqual({ source: VIEWER_SOURCE, type: 'abort', id: 1 });

    // A late response for the aborted request is ignored.
    b.receive({
      source: HOST_SOURCE,
      type: 'response',
      id: 1,
      ok: true,
      body: new ArrayBuffer(0),
    });
  });

  it('rejects immediately when already aborted', async () => {
    const { bridge: b, postMessage } = bridge();
    const controller = new AbortController();
    controller.abort();
    await expect(b.fetcher('/data', {}, { abortSignal: controller.signal })).rejects.toBeInstanceOf(
      AbortError,
    );
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('refuses endpoints outside h5grove', () => {
    const { bridge: b } = bridge();
    expect(() => b.fetcher('/v1/workspaces', {})).toThrow('Unsupported h5grove endpoint');
  });
});

describe('HostBridge.receive', () => {
  it('returns init messages and ignores foreign ones', () => {
    const { bridge: b } = bridge();
    const init = {
      source: HOST_SOURCE,
      type: 'init',
      protocol: 1,
      filepath: 'run.h5',
      locator: '/entry/data',
      revision: 0,
    };
    expect(b.receive(init)).toEqual(init);
    expect(b.receive({ source: 'someone-else', type: 'init' })).toBeUndefined();
    expect(b.receive('hello')).toBeUndefined();
  });
});

describe('endpointOf', () => {
  it.each(['meta', 'attr', 'data', 'stats', 'paths'])('accepts /%s', (name) => {
    expect(endpointOf(`/${name}`)).toBe(name);
  });
});

describe('protocol guards', () => {
  it('rejects malformed messages', () => {
    expect(
      isViewerMessage({
        source: VIEWER_SOURCE,
        type: 'fetch',
        id: 1,
        endpoint: 'files',
        params: {},
      }),
    ).toBe(false);
    expect(
      isViewerMessage({
        source: VIEWER_SOURCE,
        type: 'fetch',
        id: 1,
        endpoint: 'data',
        params: { path: 3 },
      }),
    ).toBe(false);
    expect(
      isHostMessage({ source: HOST_SOURCE, type: 'response', id: 1, ok: true, body: 'x' }),
    ).toBe(false);
  });
});

describe('observeSelection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function treeItem(path: string, selected: boolean) {
    const button = document.createElement('button');
    button.setAttribute('role', 'treeitem');
    button.setAttribute('data-path', path);
    button.setAttribute('aria-selected', String(selected));
    return button;
  }

  it('reports the selected tree item and later changes', async () => {
    const root = document.createElement('div');
    const rootItem = treeItem('/', true);
    const child = treeItem('/entry/data', false);
    root.append(rootItem, child);
    document.body.append(root);

    const onSelect = vi.fn();
    const stop = observeSelection(root, onSelect);
    expect(onSelect).toHaveBeenLastCalledWith('/');

    rootItem.setAttribute('aria-selected', 'false');
    child.setAttribute('aria-selected', 'true');
    await vi.waitFor(() => expect(onSelect).toHaveBeenLastCalledWith('/entry/data'));

    stop();
    rootItem.setAttribute('aria-selected', 'true');
    child.setAttribute('aria-selected', 'false');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe('createExportURL', () => {
  const numeric = {
    path: '/entry/image',
    shape: { class: 'Array', dims: [4, 4] },
    type: { class: 'Float', size: 64, endianness: 'little-endian' },
  };

  it('fetches NumPy and TIFF exports of numeric arrays through the bridge', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Uint8Array([1, 2]).buffer);
    const getExportURL = createExportURL(fetcher, 'runs/water.h5');
    const exporter = getExportURL('npy', numeric as never, '0,:', undefined);
    expect(typeof exporter).toBe('function');

    const blob = await (exporter as () => Promise<Blob>)();
    expect(blob.size).toBe(2);
    expect(fetcher).toHaveBeenCalledWith('/data', {
      file: 'runs/water.h5',
      path: '/entry/image',
      format: 'npy',
      selection: '0,:',
    });
  });

  it('uses the built-in exporter for CSV and JSON', async () => {
    const fetcher = vi.fn();
    const exporter = createExportURL(fetcher, 'f.h5')(
      'csv',
      numeric as never,
      undefined,
      () => 'a,b',
    );
    const blob = await (exporter as () => Promise<Blob>)();
    expect(await blob.text()).toBe('a,b');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('offers no binary export for non-numeric or scalar datasets', () => {
    const getExportURL = createExportURL(vi.fn(), 'f.h5');
    const text = {
      ...numeric,
      type: { class: 'String', strPad: 'null-terminated', charSet: 'UTF-8' },
    };
    const scalar = { ...numeric, shape: { class: 'Scalar' } };
    expect(getExportURL('npy', text as never, undefined, undefined)).toBeUndefined();
    expect(getExportURL('tiff', scalar as never, undefined, undefined)).toBeUndefined();
    expect(getExportURL('csv', numeric as never, undefined, undefined)).toBeUndefined();
  });
});
