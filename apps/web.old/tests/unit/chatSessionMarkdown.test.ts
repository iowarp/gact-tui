import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { messageToText, sessionToMarkdown } from '../../src/routes/chatSessionMarkdown.js';

describe('chatSessionMarkdown', () => {
  it('converts transcript parts into copyable text', () => {
    const message: Message = {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'hello' },
        { type: 'thinking', thinking: 'reasoning trace' },
        { type: 'tool_call', id: 'tc1', tool_name: 'shell_bash', input: { cmd: 'pwd' } },
        { type: 'tool_result', tool_call_id: 'tc1', output: 'done' },
        { type: 'file_diff', path: 'src/app.ts', diff: '@@' },
      ],
    } as Message;

    expect(messageToText(message)).toBe(
      [
        'hello',
        'reasoning trace',
        '[tool] shell_bash({"cmd":"pwd"})',
        'done',
        '[diff] src/app.ts',
      ].join('\n\n'),
    );
  });

  it('formats exported sessions as readable Markdown', () => {
    const markdown = sessionToMarkdown({
      session: { id: 's1', title: 'Debug session', created_at: '2026-06-21T10:00:00Z' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'plot it' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'done' }] },
      ],
    });

    expect(markdown).toContain('# Debug session');
    expect(markdown).toContain('*Session* `s1`');
    expect(markdown).toContain('### USER\n\nplot it');
    expect(markdown).toContain('### ASSISTANT\n\ndone');
  });
});
