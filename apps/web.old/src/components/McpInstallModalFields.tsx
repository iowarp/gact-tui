/**
 * UI component: Mcp Install Modal Fields. Renders `McpInstallModalFields` from `McpInstallModalFieldsProps`.
 */
import { For, Show, type Accessor } from 'solid-js';
import { McpInstallModalStdioFields } from './McpInstallModalStdioFields.js';
import { McpInstallModalUrlField } from './McpInstallModalUrlField.js';
import type { McpEnvRow, McpTransport } from './McpInstallModalModel.js';

export interface McpInstallModalFieldsProps {
  name: Accessor<string>;
  transport: Accessor<McpTransport>;
  command: Accessor<string>;
  argsText: Accessor<string>;
  envRows: Accessor<readonly McpEnvRow[]>;
  url: Accessor<string>;
  onChangeName: (value: string) => void;
  onChangeTransport: (value: McpTransport) => void;
  onChangeCommand: (value: string) => void;
  onChangeArgsText: (value: string) => void;
  onChangeEnvRows: (value: McpEnvRow[]) => void;
  onChangeUrl: (value: string) => void;
}

export function McpInstallModalFields(props: McpInstallModalFieldsProps) {
  return (
    <>
      <label class="mim__field">
        <span class="mim__label">Name</span>
        <input
          type="text"
          class="mim__input"
          value={props.name()}
          onInput={(event) => props.onChangeName(event.currentTarget.value)}
          placeholder="github"
          autofocus
          data-testid="mcp-install-name"
        />
      </label>

      <div class="mim__field">
        <span class="mim__label">Transport</span>
        <div class="mim__seg">
          <For each={['stdio', 'sse', 'http'] as const}>
            {(transport) => (
              <button
                type="button"
                class={'mim__seg-btn ' + (props.transport() === transport ? 'is-active' : '')}
                onClick={() => props.onChangeTransport(transport)}
                data-testid={`mcp-install-transport-${transport}`}
              >
                {transport}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={props.transport() === 'stdio'}>
        <McpInstallModalStdioFields
          command={props.command}
          argsText={props.argsText}
          envRows={props.envRows}
          onChangeCommand={props.onChangeCommand}
          onChangeArgsText={props.onChangeArgsText}
          onChangeEnvRows={props.onChangeEnvRows}
        />
      </Show>

      <Show when={props.transport() !== 'stdio'}>
        <McpInstallModalUrlField
          transport={props.transport}
          url={props.url}
          onChangeUrl={props.onChangeUrl}
        />
      </Show>
    </>
  );
}
