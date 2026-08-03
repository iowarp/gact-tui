/**
 * UI component: Mcp Install Modal Url Field. Exports `McpInstallModalUrlField`.
 */
import type { Accessor } from 'solid-js';
import type { McpTransport } from './McpInstallModalModel.js';

export function McpInstallModalUrlField(props: {
  transport: Accessor<McpTransport>;
  url: Accessor<string>;
  onChangeUrl: (value: string) => void;
}) {
  return (
    <label class="mim__field">
      <span class="mim__label">URL</span>
      <input
        type="url"
        class="mim__input mim__input--mono"
        value={props.url()}
        onInput={(event) => props.onChangeUrl(event.currentTarget.value)}
        placeholder={
          props.transport() === 'sse'
            ? 'https://mcp.example.com/sse'
            : 'https://mcp.example.com/'
        }
        data-testid="mcp-install-url"
      />
    </label>
  );
}
