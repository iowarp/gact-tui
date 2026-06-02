import { createSignal, For, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { Icon } from './Icon.js';
import { trapFocusRef } from '../focus-trap.js';
import './mcp-install-modal.css';

export interface McpInstallModalProps {
  open: boolean;
  client: Client;
  onInstalled: () => void;
  onClose: () => void;
}

type Transport = 'stdio' | 'sse' | 'http';

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
  const [transport, setTransport] = createSignal<Transport>('stdio');
  const [command, setCommand] = createSignal('');
  const [argsText, setArgsText] = createSignal('');
  const [envRows, setEnvRows] = createSignal<Array<{ key: string; value: string }>>(
    [],
  );
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
    if (!name().trim()) {
      setError('Name is required.');
      return;
    }
    const body: Parameters<Client['installMcpServer']>[0] = {
      name: name().trim(),
      transport: transport(),
    };
    if (transport() === 'stdio') {
      if (!command().trim()) {
        setError('Command is required for stdio transport.');
        return;
      }
      body.command = command().trim();
      const args = argsText()
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (args.length > 0) body.args = args;
      const env = envRows().reduce<Record<string, string>>((acc, row) => {
        const k = row.key.trim();
        if (k) acc[k] = row.value;
        return acc;
      }, {});
      if (Object.keys(env).length > 0) body.env = env;
    } else {
      if (!url().trim()) {
        setError('URL is required for sse / http transport.');
        return;
      }
      body.url = url().trim();
    }
    setSubmitting(true);
    try {
      await props.client.installMcpServer(body);
      reset();
      props.onInstalled();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
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
          <button
            type="button"
            class="mim__close"
            onClick={props.onClose}
            aria-label="Close"
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div class="mim__body">
          <label class="mim__field">
            <span class="mim__label">Name</span>
            <input
              type="text"
              class="mim__input"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="github"
              autofocus
              data-testid="mcp-install-name"
            />
          </label>

          <div class="mim__field">
            <span class="mim__label">Transport</span>
            <div class="mim__seg">
              <For each={['stdio', 'sse', 'http'] as const}>
                {(t) => (
                  <button
                    type="button"
                    class={
                      'mim__seg-btn ' +
                      (transport() === t ? 'is-active' : '')
                    }
                    onClick={() => setTransport(t)}
                    data-testid={`mcp-install-transport-${t}`}
                  >
                    {t}
                  </button>
                )}
              </For>
            </div>
          </div>

          <Show when={transport() === 'stdio'}>
            <label class="mim__field">
              <span class="mim__label">Command</span>
              <input
                type="text"
                class="mim__input mim__input--mono"
                value={command()}
                onInput={(e) => setCommand(e.currentTarget.value)}
                placeholder="/usr/local/bin/mcp-github"
                data-testid="mcp-install-command"
              />
            </label>
            <label class="mim__field">
              <span class="mim__label">Args (one per line)</span>
              <textarea
                class="mim__input mim__input--mono"
                rows={3}
                value={argsText()}
                onInput={(e) => setArgsText(e.currentTarget.value)}
                placeholder={'--token=$GITHUB_TOKEN\n--no-cache'}
                data-testid="mcp-install-args"
              />
            </label>
            <div class="mim__field">
              <span class="mim__label">Environment</span>
              <For each={envRows()}>
                {(row, i) => (
                  <div class="mim__env-row">
                    <input
                      type="text"
                      class="mim__input mim__input--mono"
                      placeholder="GITHUB_TOKEN"
                      value={row.key}
                      onInput={(e) => {
                        const next = [...envRows()];
                        next[i()] = { ...row, key: e.currentTarget.value };
                        setEnvRows(next);
                      }}
                    />
                    <input
                      type="text"
                      class="mim__input mim__input--mono"
                      placeholder="ghp_…"
                      value={row.value}
                      onInput={(e) => {
                        const next = [...envRows()];
                        next[i()] = { ...row, value: e.currentTarget.value };
                        setEnvRows(next);
                      }}
                    />
                    <button
                      type="button"
                      class="mim__env-x"
                      onClick={() =>
                        setEnvRows(envRows().filter((_, j) => j !== i()))
                      }
                      aria-label="Remove env var"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                )}
              </For>
              <button
                type="button"
                class="mim__env-add"
                onClick={() => setEnvRows([...envRows(), { key: '', value: '' }])}
              >
                <Icon name="plus" size={12} /> Add env var
              </button>
            </div>
          </Show>

          <Show when={transport() !== 'stdio'}>
            <label class="mim__field">
              <span class="mim__label">URL</span>
              <input
                type="url"
                class="mim__input mim__input--mono"
                value={url()}
                onInput={(e) => setUrl(e.currentTarget.value)}
                placeholder={
                  transport() === 'sse'
                    ? 'https://mcp.example.com/sse'
                    : 'https://mcp.example.com/'
                }
                data-testid="mcp-install-url"
              />
            </label>
          </Show>

          <Show when={error()}>
            <div class="mim__error" data-testid="mcp-install-error">
              <Icon name="alert" size={12} />
              <span>{error()}</span>
            </div>
          </Show>
        </div>

        <footer class="mim__foot">
          <button
            type="button"
            class="mim__btn"
            onClick={props.onClose}
            disabled={submitting()}
          >
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
