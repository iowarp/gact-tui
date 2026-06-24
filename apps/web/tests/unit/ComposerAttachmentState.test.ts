import { describe, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { createComposerAttachmentState } from '../../src/components/ComposerAttachmentState.js';

function dragEvent(dataTransfer: Partial<DataTransfer>): DragEvent {
  return {
    dataTransfer,
    preventDefault: vi.fn(),
  } as unknown as DragEvent;
}

describe('createComposerAttachmentState', () => {
  it('inserts a workspace mention trigger and closes the attach menu', () => {
    const [text, setText] = createSignal('open file');
    const state = createComposerAttachmentState({
      uploadFile: () => undefined,
      imageAttachCapable: () => true,
      setText,
    });
    state.setAttachMenuOpen(true);

    state.mentionWorkspaceFile();

    expect(text()).toBe('open file @');
    expect(state.attachMenuOpen()).toBe(false);
  });

  it('turns workspace file drops into @ references without uploading bytes', () => {
    const [text, setText] = createSignal('inspect');
    const upload = vi.fn();
    const state = createComposerAttachmentState({
      uploadFile: () => upload,
      imageAttachCapable: () => true,
      setText,
    });

    state.onDrop(
      dragEvent({
        getData: (kind: string) => (kind === 'application/x-gact-path' ? 'src/main.ts' : ''),
      }),
    );

    expect(text()).toBe('inspect @src/main.ts ');
    expect(upload).not.toHaveBeenCalled();
    expect(state.dragging()).toBe(false);
  });

  it('honors explicit image attach capability gating', () => {
    const [, setText] = createSignal('');
    const state = createComposerAttachmentState({
      uploadFile: () => undefined,
      imageAttachCapable: () => false,
      setText,
    });

    expect(state.imageAttachAllowed()).toBe(false);
  });
});
