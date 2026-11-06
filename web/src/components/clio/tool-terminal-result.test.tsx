import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { terminalWorkingFolder } from './tool-terminal-folder';
import { ToolTerminalResult } from './tool-terminal-result';

afterEach(cleanup);

describe('ToolTerminalResult', () => {
  it('shows output without the blank lines around it', () => {
    render(
      <ToolTerminalResult
        block={{
          id: 'terminal',
          type: 'terminal',
          command: 'cp a b',
          text: '\n\ncp: cannot create regular file: Permission denied\n\n',
          exit_code: 1,
          detail: 'Working directory: /work/sb8',
        }}
        lines={20}
        running={false}
        saved={[]}
      />,
    );
    const output = screen.getByText(/Permission denied/u);
    expect(output.textContent).toBe('cp: cannot create regular file: Permission denied');
    expect(screen.getByText('Process exited with code 1.')).toBeVisible();
  });

  it('reads the working folder from the producer detail only when it names one', () => {
    expect(
      terminalWorkingFolder({ id: 't', type: 'terminal', detail: 'Working directory: /w' }),
    ).toBe('/w');
    expect(
      terminalWorkingFolder({ id: 't', type: 'terminal', detail: 'Ran remotely' }),
    ).toBeUndefined();
  });
});
