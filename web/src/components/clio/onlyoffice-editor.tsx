import { useEffect, useState } from 'react';

interface OnlyOfficeEditor {
  destroyEditor?: () => void;
}

interface DocsApiGlobal {
  DocEditor: new (id: string, config: Record<string, unknown>) => OnlyOfficeEditor;
}

declare global {
  interface Window {
    DocsAPI?: DocsApiGlobal;
  }
}

export function ClioOnlyOfficeEditor({
  editorUrl,
  config,
}: {
  editorUrl: string;
  config: Record<string, unknown>;
}) {
  const [id] = useState(() => `onlyoffice-${crypto.randomUUID()}`);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let editor: OnlyOfficeEditor | undefined;
    let cancelled = false;
    void loadOnlyOfficeApi(onlyOfficeScriptUrl(editorUrl))
      .then(() => {
        if (cancelled || !window.DocsAPI) return;
        editor = new window.DocsAPI.DocEditor(id, {
          ...config,
          width: '100%',
          height: '100%',
        });
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'ONLYOFFICE could not start.');
        }
      });
    return () => {
      cancelled = true;
      editor?.destroyEditor?.();
    };
  }, [config, editorUrl, id]);

  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>;
  return <div className="h-full min-h-[540px] w-full" id={id} />;
}

function onlyOfficeScriptUrl(editorUrl: string) {
  const parsed = new URL(editorUrl);
  parsed.pathname = '/web-apps/apps/api/documents/api.js';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function loadOnlyOfficeApi(url: string): Promise<void> {
  if (window.DocsAPI) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-clio-onlyoffice-api]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('ONLYOFFICE API failed to load.')), {
        once: true,
      });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.dataset.clioOnlyofficeApi = 'true';
    script.src = url;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('ONLYOFFICE API failed to load.')), {
      once: true,
    });
    document.head.append(script);
  });
}
