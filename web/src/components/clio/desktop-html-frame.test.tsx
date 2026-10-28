import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HtmlRendererFrame } from './desktop-html-frame';
import { MAX_HTML_PREVIEW_TEXT_CHARS } from './html-preview-bridge';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('reports an unavailable renderer instead of leaving a blank frame indefinitely', () => {
  vi.useFakeTimers();
  render(
    <HtmlRendererFrame name="sea.html" html="<h1>Sea</h1>" url="http://host/v1/html-renderer" />,
  );
  act(() => {
    vi.advanceTimersByTime(10_000);
  });
  expect(screen.getByText('Interactive preview did not respond')).toBeVisible();
  expect(screen.queryByTitle('HTML preview of sea.html')).toBeNull();
});

it('accepts readiness only from its own frame and sends the document once', () => {
  vi.useFakeTimers();
  render(
    <HtmlRendererFrame name="sea.html" html="<h1>Sea</h1>" url="http://host/v1/html-renderer" />,
  );
  const frame = screen.getByTitle('HTML preview of sea.html') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  fireEvent.load(frame);
  fireEvent.load(frame);
  const documents = post.mock.calls.filter(([message]) => message.type === 'clio.html-preview');
  expect(documents).toHaveLength(1);
  expect(documents[0]![0].html).toContain('<h1>Sea</h1>');
  const html = documents[0]![0].html as string;
  const channel = /const channel = "([^"]+)"/.exec(html)![1];
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'clio.html-preview.mounted', channel },
        source: window,
      }),
    );
    vi.advanceTimersByTime(9_000);
  });
  expect(frame).toBeVisible();
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'clio.html-preview.mounted', channel },
        source: frame.contentWindow,
      }),
    );
    vi.advanceTimersByTime(10_000);
  });
  expect(frame).toBeVisible();
  expect(screen.queryByText('Interactive preview did not respond')).toBeNull();
});

it('accepts finite height requests only from this frame and channel', () => {
  render(<HtmlRendererFrame name="diagram.html" html="<p>Diagram</p>" />);
  const frame = screen.getByTitle('HTML preview of diagram.html') as HTMLIFrameElement;
  const channel = /const channel = "([^"]+)"/.exec(frame.srcdoc)![1];
  const size = (height: unknown, source: Window | null = frame.contentWindow, key = channel) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source,
          data: { type: 'clio.html-preview.height', channel: key, height },
        }),
      );
    });
  size(300, window);
  size(300, frame.contentWindow, 'another-frame');
  for (const invalid of [-1, 0, NaN, Infinity, '300', null]) size(invalid);
  expect(frame.style.height).toBe('100%');
  size(240.5);
  expect(frame.style.height).toBe('241px');
  size(96);
  expect(frame.style.height).toBe('96px');
  size(1e9);
  expect(frame.style.height).toBe('50000px');
});

it('reads rendered text only from the mounted frame with the exact channel and request id', async () => {
  const readers: Array<(() => Promise<string>) | undefined> = [];
  render(
    <HtmlRendererFrame
      name="agenda.html"
      html="<h1>Agenda</h1>"
      onTextReader={(reader) => readers.push(reader)}
    />,
  );
  const frame = screen.getByTitle('HTML preview of agenda.html') as HTMLIFrameElement;
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const document = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
  const channel = /const channel = "([^"]+)"/.exec(
    document.querySelector('script')!.textContent!,
  )![1]!;

  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'clio.html-preview.mounted', channel },
        source: frame.contentWindow,
      }),
    );
  });
  const readText = readers.find((reader) => reader !== undefined);
  expect(readText).toBeDefined();

  const result = readText!();
  const observed = result.then((value) => {
    return value;
  });
  const request = post.mock.calls
    .map(([message]) => message)
    .find((message) => message.type === 'clio.html-preview.read-text');
  expect(request).toBeDefined();
  const requestId = request!.requestId as string;

  const reply = (source: Window | null, replyChannel: string, id: string, text: unknown) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        data: { type: 'clio.html-preview.text', channel: replyChannel, requestId: id, text },
      }),
    );
  act(() => {
    reply(window, channel, requestId, 'forged source');
    reply(frame.contentWindow, 'wrong-channel', requestId, 'forged channel');
    reply(frame.contentWindow, channel, 'wrong-request', 'forged request');
  });

  let resolved = false;
  void observed.then(() => {
    resolved = true;
  });
  await Promise.resolve();
  expect(resolved).toBe(false);

  act(() => reply(frame.contentWindow, channel, requestId, 'Agenda\nSession one'));
  await expect(observed).resolves.toBe('Agenda\nSession one');
});

it('rejects oversized rendered text and releases pending readers on unmount', async () => {
  const readers: Array<(() => Promise<string>) | undefined> = [];
  const { unmount } = render(
    <HtmlRendererFrame
      name="large.html"
      html="<h1>Large</h1>"
      onTextReader={(reader) => readers.push(reader)}
    />,
  );
  const frame = screen.getByTitle('HTML preview of large.html') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const document = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
  const channel = /const channel = "([^"]+)"/.exec(
    document.querySelector('script')!.textContent!,
  )![1]!;
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'clio.html-preview.mounted', channel },
        source: frame.contentWindow,
      }),
    );
  });
  const readText = readers.find((reader) => reader !== undefined)!;
  const oversized = readText();
  const oversizedResult = oversized.catch((error: unknown) => (error as Error).message);
  const oversizedRequest = post.mock.calls
    .map(([message]) => message)
    .find((message) => message.type === 'clio.html-preview.read-text')!;
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: {
          type: 'clio.html-preview.text-error',
          channel,
          requestId: oversizedRequest.requestId,
          code: 'too-large',
        },
      }),
    );
  });
  await expect(oversizedResult).resolves.toBe('Rendered preview text is too large to copy.');

  const pending = readText();
  const pendingResult = pending.catch((error: unknown) => (error as Error).message);
  unmount();
  await expect(pendingResult).resolves.toBe(
    'The rendered preview was closed before text was returned.',
  );
  expect(readers.at(-1)).toBeUndefined();
});

it('rejects an over-limit reply even when the frame sends text instead of a size error', async () => {
  const readers: Array<(() => Promise<string>) | undefined> = [];
  render(
    <HtmlRendererFrame
      name="oversized.html"
      html="<h1>Oversized</h1>"
      onTextReader={(reader) => readers.push(reader)}
    />,
  );
  const frame = screen.getByTitle('HTML preview of oversized.html') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const document = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
  const channel = /const channel = "([^"]+)"/.exec(
    document.querySelector('script')!.textContent!,
  )![1]!;
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'clio.html-preview.mounted', channel },
        source: frame.contentWindow,
      }),
    );
  });
  const readText = readers.find((reader) => reader !== undefined)!;
  const result = readText();
  const request = post.mock.calls
    .map(([message]) => message)
    .find((message) => message.type === 'clio.html-preview.read-text')!;
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: {
          type: 'clio.html-preview.text',
          channel,
          requestId: request.requestId,
          text: 'x'.repeat(MAX_HTML_PREVIEW_TEXT_CHARS + 1),
        },
      }),
    );
  });
  await expect(result).rejects.toThrow('exceeded the copy limit');
});
