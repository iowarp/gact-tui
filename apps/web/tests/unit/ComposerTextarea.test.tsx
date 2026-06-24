import { createSignal } from 'solid-js';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { ComposerTextarea } from '../../src/components/ComposerTextarea.js';
import type { ComposerHistory } from '../../src/components/ComposerState.js';

afterEach(cleanup);

function renderTextarea(options: { onSlashTyped?: () => void } = {}) {
  const [text, setText] = createSignal('');
  const [pasteStash, setPasteStash] = createSignal<Record<string, string>>({});
  const history: ComposerHistory = {
    push: () => {},
    previous: () => null,
    next: () => null,
    exit: () => {},
  };

  render(() => (
    <ComposerTextarea
      text={text}
      setText={setText}
      history={history}
      submit={() => {}}
      pasteStash={pasteStash}
      setPasteStash={setPasteStash}
      pasteCompressThreshold={2}
      onSlashTyped={options.onSlashTyped}
    />
  ));

  return screen.getByTestId('composer-input') as HTMLTextAreaElement;
}

describe('ComposerTextarea', () => {
  it('routes slash on an empty draft to the command palette handler', () => {
    let slashTyped = 0;
    const input = renderTextarea({ onSlashTyped: () => slashTyped++ });

    fireEvent.keyDown(input, { key: '/' });

    expect(slashTyped).toBe(1);
    expect(input.value).toBe('');
  });

  it('compresses pasted multiline content and expands the latest placeholder', async () => {
    const input = renderTextarea();
    fireEvent.input(input, { target: { value: 'before ' } });
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.paste(input, {
      clipboardData: {
        getData: (format: string) => (format === 'text' ? 'a\nb\nc' : ''),
      },
    });

    await Promise.resolve();
    expect(input.value).toContain('[pasted 3 lines');

    fireEvent.keyDown(input, { key: 'p', ctrlKey: true });

    await Promise.resolve();
    expect(input.value).toBe('before a\nb\nc');
  });
});
