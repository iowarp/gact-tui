import { useEffect, useMemo, useRef, useState } from 'react';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ResourceUnavailable } from './resource-states';
import { vocab } from '@/lib/brand-vocabulary';
import { htmlPreviewHostDocument } from './html-preview-bridge';
import { useHtmlPreviewTheme } from './html-preview-theme';
import { nanoid } from 'nanoid';

/** A network document has its own policy; srcdoc would inherit Desktop's CSP. */
export function DesktopHtmlFrame({ name, html }: { name: string; html: string }) {
  const { settings } = useConnectionSettings();
  const url = `${settings.endpoint.replace(/\/+$/u, '')}/v1/html-renderer`;
  return <HtmlRendererFrame name={name} html={html} url={url} />;
}

interface HtmlRendererFrameProps {
  name: string;
  html: string;
  url?: string;
}

/** Fit authored content; theme updates preserve the live document and its state. */
export function HtmlRendererFrame(props: HtmlRendererFrameProps) {
  return <BoundHtmlRendererFrame key={props.html} {...props} />;
}

function BoundHtmlRendererFrame({ name, html, url }: HtmlRendererFrameProps) {
  const delivered = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  const [height, setHeight] = useState<number>();
  const [channel] = useState(() => nanoid(24));
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
        frame.current?.contentWindow?.postMessage(
          { type: 'clio.html-preview.theme', channel, theme: currentTheme.current },
          '*',
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
    };
  }, [channel]);
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
