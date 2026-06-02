/**
 * 1.0 items 2 + 3 — inline image parts, retry-lineage chip, Attempts tab,
 * and context-file content preview.
 */
import { render, screen, cleanup, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';
import { InspectorDrawer } from '../../src/components/InspectorDrawer.js';
import type { ContextFileContent, Message, TurnAttempt } from '@clio/core';

afterEach(cleanup);

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Inline image parts (1.0 item 2)', () => {
  it('renders base64 image parts as <img> with a data URL', () => {
    const msg: Message = {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'image',
          source: { kind: 'base64', media_type: 'image/png', data: TINY_PNG },
        },
      ],
    } as Message;
    render(() => <Transcript messages={[msg]} density="normal" />);
    const img = screen.getByTestId('trx-image') as HTMLImageElement;
    expect(img.src).toContain('data:image/png;base64,');
  });

  it('renders an honest placeholder for backend file references', () => {
    const msg: Message = {
      id: 'm2',
      role: 'assistant',
      parts: [
        { type: 'image', source: { kind: 'file_id', file_id: 'file_x' } },
      ],
    } as Message;
    render(() => <Transcript messages={[msg]} density="normal" />);
    expect(screen.getByTestId('trx-image-unavailable')).toBeTruthy();
  });

  it('keeps images visible in summary density', () => {
    const msg: Message = {
      id: 'm3',
      role: 'assistant',
      parts: [
        {
          type: 'image',
          source: { kind: 'base64', media_type: 'image/png', data: TINY_PNG },
        },
      ],
    } as Message;
    render(() => <Transcript messages={[msg]} density="summary" />);
    expect(screen.getByTestId('trx-image')).toBeTruthy();
  });
});

describe('Retry lineage (1.0 item 3)', () => {
  it('shows the retry chip on messages created by a retry', () => {
    const msg: Message = {
      id: 'u1',
      role: 'user',
      metadata: { retry_attempt_id: 'attempt_1' },
      parts: [{ type: 'text', text: 'original + notes' }],
    } as Message;
    render(() => <Transcript messages={[msg]} density="normal" />);
    expect(screen.getByTestId('msg-retry-chip-u1')).toBeTruthy();
  });

  it('no chip on ordinary messages', () => {
    const msg: Message = {
      id: 'u2',
      role: 'user',
      parts: [{ type: 'text', text: 'plain' }],
    } as Message;
    render(() => <Transcript messages={[msg]} density="normal" />);
    expect(screen.queryByTestId('msg-retry-chip-u2')).toBeNull();
  });

  it('Attempts tab lists attempts with status, notes and model', () => {
    const attempts: TurnAttempt[] = [
      {
        id: 'att_1',
        session_id: 's',
        source_message_id: 'm',
        status: 'completed',
        created_at: '2026-06-02T10:00:00Z',
        updated_at: '2026-06-02T10:00:10Z',
        notes: 'Answer in exactly three words.',
        model: { provider_id: 'anthropic', model_id: 'claude-opus-4' },
      },
      {
        id: 'att_2',
        session_id: 's',
        source_message_id: 'm',
        status: 'failed',
        created_at: '2026-06-02T10:01:00Z',
        updated_at: '2026-06-02T10:01:05Z',
      },
    ];
    render(() => (
      <InspectorDrawer
        open={true}
        message={null}
        toolCalls={[]}
        costUsd={0}
        attempts={attempts}
        onClose={() => undefined}
      />
    ));
    screen.getByTestId('inspector-tab-attempts').click();
    expect(screen.getByTestId('inspector-attempts')).toBeTruthy();
    expect(screen.getByTestId('attempt-notes-att_1').textContent).toContain(
      'three words',
    );
    expect(screen.getByText('claude-opus-4')).toBeTruthy();
    expect(screen.getByText('failed')).toBeTruthy();
  });
});

describe('Context-file content preview (1.0 item 2)', () => {
  const FILES = [{ path: 'chart.png', mode: 'read' as const }];

  it('shows a preview button only when the capability callback is wired', () => {
    const { unmount } = render(() => (
      <InspectorDrawer
        open={true}
        message={null}
        toolCalls={[]}
        costUsd={0}
        contextFiles={FILES}
        onClose={() => undefined}
      />
    ));
    expect(screen.queryByTestId('inspector-file-preview-chart.png')).toBeNull();
    unmount();

    render(() => (
      <InspectorDrawer
        open={true}
        message={null}
        toolCalls={[]}
        costUsd={0}
        contextFiles={FILES}
        onPreviewContextFile={() =>
          Promise.resolve({
            path: 'chart.png',
            size: 1,
            media_type: 'image/png',
            encoding: 'base64',
            data: TINY_PNG,
          } as ContextFileContent)
        }
        onClose={() => undefined}
      />
    ));
    screen.getByTestId('inspector-tab-context').click();
    expect(screen.getByTestId('inspector-file-preview-chart.png')).toBeTruthy();
  });

  it('clicking preview fetches and renders an image', async () => {
    render(() => (
      <InspectorDrawer
        open={true}
        message={null}
        toolCalls={[]}
        costUsd={0}
        contextFiles={FILES}
        onPreviewContextFile={() =>
          Promise.resolve({
            path: 'chart.png',
            size: 1,
            media_type: 'image/png',
            encoding: 'base64',
            data: TINY_PNG,
          } as ContextFileContent)
        }
        onClose={() => undefined}
      />
    ));
    screen.getByTestId('inspector-tab-context').click();
    screen.getByTestId('inspector-file-preview-chart.png').click();
    await waitFor(() => {
      expect(screen.getByTestId('inspector-preview-image')).toBeTruthy();
    });
  });

  it('clicking preview renders decoded text for text files', async () => {
    render(() => (
      <InspectorDrawer
        open={true}
        message={null}
        toolCalls={[]}
        costUsd={0}
        contextFiles={[{ path: 'notes.txt', mode: 'read' as const }]}
        onPreviewContextFile={() =>
          Promise.resolve({
            path: 'notes.txt',
            size: 11,
            media_type: 'text/plain',
            encoding: 'base64',
            data: btoa('hello clio!'),
          } as ContextFileContent)
        }
        onClose={() => undefined}
      />
    ));
    screen.getByTestId('inspector-tab-context').click();
    screen.getByTestId('inspector-file-preview-notes.txt').click();
    await waitFor(() => {
      expect(screen.getByTestId('inspector-preview-text').textContent).toContain(
        'hello clio!',
      );
    });
  });
});
