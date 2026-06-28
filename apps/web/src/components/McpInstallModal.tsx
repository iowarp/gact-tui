/**
 * UI component: Mcp Install Modal. Renders `McpInstallModal` from `McpInstallModalProps`.
 */
import { createSignal, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { Icon } from './Icon.js';
import { runAsyncAction } from '../asyncAction.js';
import { trapFocusRef } from '../focus-trap.js';
import { buildMcpInstallBody, type McpTransport } from './McpInstallModalModel.js';
import { McpInstallModalFields } from './McpInstallModalFields.js';
import './mcp-install-modal.css';

export interface McpInstallModalProps {
  open: boolean;
  client: Client;
  onInstalled: () => void;
  onClose: () => void;
}

/**
 * Form for `POST /v1/mcp/servers` — TUI ships this via a one-line
 * JSON modal; we render a proper transport-aware form so the user
 * doesn't have to know the wire shape:
 *
 *   stdio:        name + command + args + env
 *   sse | http:   name + url
 *
 * On success the parent refetches the server list and closes the
 * modal.
 */
export function McpInstallModal(props: McpInstallModalProps) {
  const [name, setName] = createSignal('');
  const [transport, setTransport] = createSignal<McpTransport>('stdio');
  const [command, setCommand] = createSignal('');
  const [argsText, setArgsText] = createSignal('');
  const [envRows, setEnvRows] = createSignal<Array<{ key: string; value: string }>>([]);
  const [url, setUrl] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  function reset() {
    setName('');
    setTransport('stdio');
    setCommand('');
    setArgsText('');
    setEnvRows([]);
    setUrl('');
    setError(null);
  }

  async function submit() {
    if (submitting()) return;
    setError(null);
    const built = buildMcpInstallBody({
      name: name(),
      transport: transport(),
      command: command(),
      argsText: argsText(),
      envRows: envRows(),
      url: url(),
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    await runAsyncAction(
      async () => {
        await props.client.installMcpServer(built.body);
        reset();
        props.onInstalled();
      },
      {
        setBusy: setSubmitting,
        setError,
      },
    );
  }

  return (
    <Show when={props.open}>
      <div class="mim__backdrop" onClick={props.onClose} />
      <div
        class="mim"
        role="dialog"
        aria-modal="true"
        aria-label="Install an MCP server"
        ref={trapFocusRef}
        data-testid="mcp-install-modal"
      >
        <header class="mim__head">
          <h2 class="mim__title">Install MCP server</h2>
          <button type="button" class="mim__close" onClick={props.onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </header>

        <div class="mim__body">
          <McpInstallModalFields
            name={name}
            transport={transport}
            command={command}
            argsText={argsText}
            envRows={envRows}
            url={url}
            onChangeName={setName}
            onChangeTransport={setTransport}
            onChangeCommand={setCommand}
            onChangeArgsText={setArgsText}
            onChangeEnvRows={setEnvRows}
            onChangeUrl={setUrl}
          />

          <Show when={error()}>
            <div class="mim__error" data-testid="mcp-install-error">
              <Icon name="alert" size={12} />
              <span>{error()}</span>
            </div>
          </Show>
        </div>

        <footer class="mim__foot">
          <button type="button" class="mim__btn" onClick={props.onClose} disabled={submitting()}>
            Cancel
          </button>
          <button
            type="button"
            class="mim__btn mim__btn--primary"
            onClick={() => void submit()}
            disabled={submitting() || !name().trim()}
            data-testid="mcp-install-submit"
          >
            {submitting() ? 'Installing…' : 'Install'}
          </button>
        </footer>
      </div>
    </Show>
  );
}
