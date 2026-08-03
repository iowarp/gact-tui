import { createSignal } from 'solid-js';
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { McpInstallModalFields } from '../../src/components/McpInstallModalFields.js';
import type { McpEnvRow, McpTransport } from '../../src/components/McpInstallModalModel.js';

afterEach(cleanup);

function Harness() {
  const [name, setName] = createSignal('');
  const [transport, setTransport] = createSignal<McpTransport>('stdio');
  const [command, setCommand] = createSignal('');
  const [argsText, setArgsText] = createSignal('');
  const [envRows, setEnvRows] = createSignal<McpEnvRow[]>([]);
  const [url, setUrl] = createSignal('');

  return (
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
  );
}

describe('McpInstallModalFields', () => {
  it('edits stdio fields and environment rows', () => {
    render(() => <Harness />);

    fireEvent.input(screen.getByTestId('mcp-install-name'), {
      target: { value: 'github' },
    });
    fireEvent.input(screen.getByTestId('mcp-install-command'), {
      target: { value: '/usr/bin/mcp-github' },
    });
    fireEvent.input(screen.getByTestId('mcp-install-args'), {
      target: { value: '--token=$GITHUB_TOKEN' },
    });

    expect((screen.getByTestId('mcp-install-name') as HTMLInputElement).value).toBe('github');
    expect((screen.getByTestId('mcp-install-command') as HTMLInputElement).value).toBe(
      '/usr/bin/mcp-github',
    );
    expect((screen.getByTestId('mcp-install-args') as HTMLTextAreaElement).value).toBe(
      '--token=$GITHUB_TOKEN',
    );

    fireEvent.click(screen.getByText('Add env var'));
    const keyInput = screen.getByPlaceholderText('GITHUB_TOKEN') as HTMLInputElement;
    const valueInput = screen.getByPlaceholderText('ghp_…') as HTMLInputElement;
    fireEvent.input(keyInput, { target: { value: 'GITHUB_TOKEN' } });
    fireEvent.input(valueInput, { target: { value: 'ghp_123' } });

    expect(keyInput.value).toBe('GITHUB_TOKEN');
    expect(valueInput.value).toBe('ghp_123');

    fireEvent.click(screen.getByLabelText('Remove env var'));
    expect(screen.queryByPlaceholderText('GITHUB_TOKEN')).toBeNull();
  });

  it('switches to URL transports and updates URL input', () => {
    render(() => <Harness />);

    fireEvent.click(screen.getByTestId('mcp-install-transport-sse'));
    expect(screen.queryByTestId('mcp-install-command')).toBeNull();
    const urlInput = screen.getByTestId('mcp-install-url') as HTMLInputElement;
    expect(urlInput.placeholder).toBe('https://mcp.example.com/sse');

    fireEvent.input(urlInput, { target: { value: 'https://mcp.example.com/sse' } });
    expect(urlInput.value).toBe('https://mcp.example.com/sse');

    fireEvent.click(screen.getByTestId('mcp-install-transport-http'));
    expect((screen.getByTestId('mcp-install-url') as HTMLInputElement).placeholder).toBe(
      'https://mcp.example.com/',
    );
  });
});
