/**
 * UI component: Mcp Install Modal Stdio Fields. Exports `McpInstallModalStdioFields`.
 */
import { For, type Accessor } from 'solid-js';
import { Icon } from './Icon.js';
import type { McpEnvRow } from './McpInstallModalModel.js';

export function McpInstallModalStdioFields(props: {
  command: Accessor<string>;
  argsText: Accessor<string>;
  envRows: Accessor<readonly McpEnvRow[]>;
  onChangeCommand: (value: string) => void;
  onChangeArgsText: (value: string) => void;
  onChangeEnvRows: (value: McpEnvRow[]) => void;
}) {
  function updateEnvRow(index: number, patch: Partial<McpEnvRow>) {
    const next = [...props.envRows()];
    const row = next[index];
    if (!row) return;
    next[index] = { ...row, ...patch };
    props.onChangeEnvRows(next);
  }

  return (
    <>
      <label class="mim__field">
        <span class="mim__label">Command</span>
        <input
          type="text"
          class="mim__input mim__input--mono"
          value={props.command()}
          onInput={(event) => props.onChangeCommand(event.currentTarget.value)}
          placeholder="/usr/local/bin/mcp-github"
          data-testid="mcp-install-command"
        />
      </label>
      <label class="mim__field">
        <span class="mim__label">Args (one per line)</span>
        <textarea
          class="mim__input mim__input--mono"
          rows={3}
          value={props.argsText()}
          onInput={(event) => props.onChangeArgsText(event.currentTarget.value)}
          placeholder={'--token=$GITHUB_TOKEN\n--no-cache'}
          data-testid="mcp-install-args"
        />
      </label>
      <div class="mim__field">
        <span class="mim__label">Environment</span>
        <For each={props.envRows()}>
          {(row, index) => (
            <div class="mim__env-row">
              <input
                type="text"
                class="mim__input mim__input--mono"
                placeholder="GITHUB_TOKEN"
                value={row.key}
                onInput={(event) => updateEnvRow(index(), { key: event.currentTarget.value })}
              />
              <input
                type="text"
                class="mim__input mim__input--mono"
                placeholder="ghp_…"
                value={row.value}
                onInput={(event) => updateEnvRow(index(), { value: event.currentTarget.value })}
              />
              <button
                type="button"
                class="mim__env-x"
                onClick={() =>
                  props.onChangeEnvRows(
                    props.envRows().filter((_, rowIndex) => rowIndex !== index()),
                  )
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
          onClick={() => props.onChangeEnvRows([...props.envRows(), { key: '', value: '' }])}
        >
          <Icon name="plus" size={12} /> Add env var
        </button>
      </div>
    </>
  );
}
