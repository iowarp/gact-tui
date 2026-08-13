import { onCleanup, onMount } from 'solid-js';

interface OnlyOfficeDocumentEditorProps {
  editorUrl: string;
  config: Record<string, unknown>;
}

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

function scriptUrl(editorUrl: string): string {
  const parsed = new URL(editorUrl);
  parsed.pathname = '/web-apps/apps/api/documents/api.js';
  parsed.search = '';
  return parsed.toString();
}

function loadOnlyOfficeApi(url: string): Promise<void> {
  if (window.DocsAPI) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-clio-onlyoffice-api]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('ONLYOFFICE API failed')), {
        once: true,
      });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.dataset.clioOnlyofficeApi = 'true';
    script.src = url;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('ONLYOFFICE API failed')), {
      once: true,
    });
    document.head.append(script);
  });
}

export function OnlyOfficeDocumentEditor(props: OnlyOfficeDocumentEditorProps) {
  const id = `onlyoffice-${crypto.randomUUID()}`;
  let editor: OnlyOfficeEditor | undefined;
  let host: HTMLDivElement | undefined;

  onMount(() => {
    void loadOnlyOfficeApi(scriptUrl(props.editorUrl))
      .then(() => {
        if (!window.DocsAPI || !host) throw new Error('ONLYOFFICE API is unavailable');
        editor = new window.DocsAPI.DocEditor(id, {
          ...props.config,
          width: '100%',
          height: '100%',
        });
      })
      .catch((error: unknown) => {
        if (host) {
          host.textContent = error instanceof Error ? error.message : 'ONLYOFFICE could not start';
        }
      });
  });

  onCleanup(() => editor?.destroyEditor?.());

  return <div ref={host} id={id} class="document-embedded-editor" />;
}
