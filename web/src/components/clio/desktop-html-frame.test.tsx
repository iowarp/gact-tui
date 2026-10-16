import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HtmlRendererFrame } from './desktop-html-frame';

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
