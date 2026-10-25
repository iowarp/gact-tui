import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ResourceUnavailable } from './resource-states';
import { vocab } from '@/lib/brand-vocabulary';
import {
  HTML_PREVIEW_TEXT_TIMEOUT_MS,
  MAX_HTML_PREVIEW_TEXT_CHARS,
  htmlPreviewHostDocument,
  type HtmlPreviewTextReaderChange,
} from './html-preview-bridge';
import { useHtmlPreviewTheme } from './html-preview-theme';
import { nanoid } from 'nanoid';

/** A network document has its own policy; srcdoc would inherit Desktop's CSP. */
export function DesktopHtmlFrame({
  name,
  html,
  onTextReader,
}: {
  name: string;
  html: string;
  onTextReader?: HtmlPreviewTextReaderChange;
}) {
  const { settings } = useConnectionSettings();
  const url = `${settings.endpoint.replace(/\/+$/u, '')}/v1/html-renderer`;
  return <HtmlRendererFrame name={name} html={html} url={url} onTextReader={onTextReader} />;
}

interface HtmlRendererFrameProps {
  name: string;
  html: string;
  url?: string;
  onTextReader?: HtmlPreviewTextReaderChange;
}

/** Fit authored content; theme updates preserve the live document and its state. */
export function HtmlRendererFrame(props: HtmlRendererFrameProps) {
  return <BoundHtmlRendererFrame key={props.html} {...props} />;
}

function BoundHtmlRendererFrame({ name, html, url, onTextReader }: HtmlRendererFrameProps) {
  const delivered = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  const [height, setHeight] = useState<number>();
  const [channel] = useState(() => nanoid(24));
  const textReaderCallback = useRef(onTextReader);
  const bridgeReady = useRef(false);
  const pendingText = useRef(
    new Map<
      string,
      { resolve: (text: string) => void; reject: (error: Error) => void; timer: number }
    >(),
  );
  const requestRenderedText = useCallback((): Promise<string> => {
    const target = frame.current?.contentWindow;
    if (!target) return Promise.reject(new Error('The rendered preview is not available.'));
    const requestId = nanoid(20);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingText.current.delete(requestId);
        reject(new Error('The rendered preview did not return text in time.'));
      }, HTML_PREVIEW_TEXT_TIMEOUT_MS);
      pendingText.current.set(requestId, { resolve, reject, timer });
      try {
        target.postMessage({ type: 'clio.html-preview.read-text', channel, requestId }, '*');
      } catch {
        window.clearTimeout(timer);
        pendingText.current.delete(requestId);
        reject(new Error('The rendered preview could not receive a text request.'));
      }
    });
  }, [channel]);
  useEffect(() => {
    textReaderCallback.current = onTextReader;
  }, [onTextReader]);
  useEffect(() => {
    if (bridgeReady.current) onTextReader?.(requestRenderedText);
    return () => onTextReader?.(undefined);
  }, [onTextReader, requestRenderedText]);
  const theme = useHtmlPreviewTheme();
  const [initialTheme] = useState(theme);
  const currentTheme = useRef(theme);
  const documentHtml = useMemo(
    () => htmlPreviewHostDocument(html, channel, initialTheme),
    [html, channel, initialTheme],
  );
  const notifyTheme = () =>
    frame.current?.contentWindow?.postMessage(
      { type: 'clio.html-preview.theme', channel, theme: currentTheme.current },
      '*',
    );
  useEffect(() => {
    currentTheme.current = theme;
    frame.current?.contentWindow?.postMessage(
      { type: 'clio.html-preview.theme', channel, theme },
      '*',
    );
  }, [theme, channel]);
  useEffect(() => {
    const pendingRequests = pendingText.current;
    const timer = window.setTimeout(() => setFailed(true), 10_000);
    const ready = (event: MessageEvent) => {
      if (
        !frame.current?.contentWindow ||
        event.source !== frame.current.contentWindow ||
        event.data?.channel !== channel
      )
        return;
      if (event.data.type === 'clio.html-preview.mounted') {
        window.clearTimeout(timer);
        bridgeReady.current = true;
        textReaderCallback.current?.(requestRenderedText);
        frame.current?.contentWindow?.postMessage(
          { type: 'clio.html-preview.theme', channel, theme: currentTheme.current },
          '*',
        );
      } else if (event.data.type === 'clio.html-preview.text') {
        const requestId: unknown = event.data.requestId;
        const text: unknown = event.data.text;
        if (typeof requestId !== 'string') return;
        const pending = pendingRequests.get(requestId);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        pendingRequests.delete(requestId);
        if (typeof text !== 'string' || text.length > MAX_HTML_PREVIEW_TEXT_CHARS) {
          pending.reject(
            new Error('The rendered preview text was invalid or exceeded the copy limit.'),
          );
        } else {
          pending.resolve(text);
        }
      } else if (event.data.type === 'clio.html-preview.text-error') {
        const requestId: unknown = event.data.requestId;
        if (typeof requestId !== 'string') return;
        const pending = pendingRequests.get(requestId);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        pendingRequests.delete(requestId);
        pending.reject(
          new Error(
            event.data.code === 'too-large'
              ? 'Rendered preview text is too large to copy.'
              : 'The rendered preview could not provide text.',
          ),
        );
      } else if (event.data.type === 'clio.html-preview.height') {
        const value: unknown = event.data.height;
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          // Bound untrusted layout requests; very large documents retain ordinary scrolling.
          setHeight(Math.min(50_000, Math.max(1, Math.ceil(value))));
        }
      }
    };
    window.addEventListener('message', ready);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', ready);
      bridgeReady.current = false;
      for (const pending of pendingRequests.values()) {
        window.clearTimeout(pending.timer);
        pending.reject(new Error('The rendered preview was closed before text was returned.'));
      }
      pendingRequests.clear();
    };
  }, [channel, requestRenderedText]);
  if (failed)
    return (
      <ResourceUnavailable
        label="Interactive preview did not respond"
        detail={`Use Restart to try again, or open the file in your browser. Update the connected ${vocab.product} if it does not support interactive previews.`}
      />
    );
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-slot="html-preview-viewport">
      <iframe
        ref={frame}
        className="block w-full shrink-0 border-0 bg-background"
        style={{ height: height ?? '100%', minHeight: height === undefined ? 150 : undefined }}
        title={`HTML preview of ${name}`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        src={url}
        srcDoc={url ? undefined : documentHtml}
        onLoad={(event) => {
          if (!url) {
            notifyTheme();
            return;
          }
          if (delivered.current) return;
          delivered.current = true;
          event.currentTarget.contentWindow?.postMessage(
            { type: 'clio.html-preview', html: documentHtml },
            '*',
          );
        }}
      />
    </div>
  );
}
