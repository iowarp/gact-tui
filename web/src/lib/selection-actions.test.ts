import { QuoteIcon } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentAnswerSelection,
  createSelectionActionRegistry,
  type SelectionAction,
  type SelectionTarget,
} from './selection-actions';

const target: SelectionTarget = {
  kind: 'agent-answer-text',
  text: 'brighter, tangy',
  sessionId: 'sess_1',
  messageId: 'msg_1',
};

function action(overrides: Partial<SelectionAction>): SelectionAction {
  return {
    id: 'a',
    label: 'A',
    icon: QuoteIcon,
    order: 10,
    kinds: ['agent-answer-text'],
    run: vi.fn(),
    ...overrides,
  };
}

describe('createSelectionActionRegistry', () => {
  it('offers registered actions for their kinds, in order, and withdraws them', () => {
    const registry = createSelectionActionRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.register(action({ id: 'details', label: 'More details', order: 20 }));
    const unregister = registry.register(action({ id: 'add', label: 'Add to chat', order: 10 }));
    registry.register(action({ id: 'hidden', isAvailable: () => false }));

    expect(registry.actionsFor(target).map((item) => item.id)).toEqual(['add', 'details']);
    expect(listener).toHaveBeenCalledTimes(3);

    unregister();
    expect(registry.actionsFor(target).map((item) => item.id)).toEqual(['details']);
  });

  it('replaces an action registered again under the same id', () => {
    const registry = createSelectionActionRegistry();
    const first = registry.register(action({ id: 'add', label: 'Old' }));
    registry.register(action({ id: 'add', label: 'New' }));
    first();
    expect(registry.actionsFor(target).map((item) => item.label)).toEqual(['New']);
  });
});

describe('agentAnswerSelection', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = '';
  });

  function transcript() {
    document.body.innerHTML = `
      <div data-selection-surface="agent-answer" data-session-id="sess_1" data-message-id="msg_1">
        <div data-slot="message-text"><p id="a">A familiar plate format with a brighter, tangy flavor.</p></div>
        <div data-slot="tool"><p id="tool">Read evidence</p></div>
      </div>
      <div data-session-id="sess_1" data-message-id="msg_0">
        <div data-slot="message-text"><p id="user">Can you swap the sauce?</p></div>
      </div>`;
  }

  function select(startId: string, start: number, endId: string, end: number) {
    const range = document.createRange();
    range.setStart(document.getElementById(startId)!.firstChild!, start);
    range.setEnd(document.getElementById(endId)!.firstChild!, end);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  }

  it('reads text selected inside one agent answer with its session and message', () => {
    transcript();
    expect(agentAnswerSelection(select('a', 31, 'a', 46))).toEqual({
      kind: 'agent-answer-text',
      text: 'brighter, tangy',
      sessionId: 'sess_1',
      messageId: 'msg_1',
    });
  });

  it('ignores selections that leave the answer text or are not in an agent answer', () => {
    transcript();
    expect(agentAnswerSelection(select('a', 30, 'tool', 4))).toBeUndefined();
    expect(agentAnswerSelection(select('user', 0, 'user', 7))).toBeUndefined();
    expect(agentAnswerSelection(select('a', 3, 'a', 3))).toBeUndefined();
  });
});
