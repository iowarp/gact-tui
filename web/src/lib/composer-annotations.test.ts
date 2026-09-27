import { describe, expect, it } from 'vitest';
import { annotationFromSelection, messageTextWithAnnotations } from './composer-annotations';

const quote = (text: string) =>
  annotationFromSelection({ kind: 'agent-answer-text', text, sessionId: 's', messageId: 'm' });

describe('messageTextWithAnnotations', () => {
  it('sends each selection as a blockquote ahead of the written text', () => {
    expect(
      messageTextWithAnnotations(
        [quote('brighter, tangy'), quote('dill-caper sauce\n\nwith Dijon')],
        'Why this sauce?',
      ),
    ).toBe('> brighter, tangy\n\n> dill-caper sauce\n>\n> with Dijon\n\nWhy this sauce?');
  });

  it('leaves text untouched without annotations and sends quotes alone without text', () => {
    expect(messageTextWithAnnotations([], 'Hello')).toBe('Hello');
    expect(messageTextWithAnnotations([quote('only this')], '')).toBe('> only this');
  });

  it('gives every annotation its own id', () => {
    expect(quote('a').id).not.toBe(quote('a').id);
  });
});
