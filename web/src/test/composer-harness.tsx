import type { CommandDefinition, MessageBehavior } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { ClioComposer, type ClioComposerProps } from '@/components/clio/composer';
import { LiveConnection } from './live-connection';

// Shared setup for the composer service-command and attachment tests. Each test
// file keeps its own vi.mock calls, because Vitest hoists them per file.

/** The composer's editor: a combobox because it drives the reference popover. */
export function composerEditor(): HTMLElement {
  return screen.getByRole('combobox', { name: /^Ask / });
}

export function installMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      matches: true,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
    writable: true,
  });
}

export const commands: CommandDefinition[] = [
  {
    id: '/review',
    kind: 'command',
    name: '/review',
    qualified_id: '/review',
    plugin: '',
    label: '',
    unsupported_fields: [],
    title: 'Review evidence',
    description: 'Review an artifact with the configured evidence agent.',
    source: 'clio-agent',
    status: 'ready',
    enabled: true,
    aliases: ['/rev'],
    argument_hint: '<artifact path>',
    arguments: [],
    metadata: {},
  },
  {
    id: '/admin',
    kind: 'command',
    name: '/admin',
    qualified_id: '/admin',
    plugin: '',
    label: '',
    unsupported_fields: [],
    title: 'Admin operation',
    source: 'clio-agent',
    status: 'disabled',
    enabled: false,
    disabled_reason: 'Requires administrator access.',
    aliases: [],
    arguments: [],
    metadata: {},
  },
];

/** Overridable per-render selection, reapplied by `rerenderWith` below. */
interface ComposerSelection {
  confirmationPolicy?: MessageBehavior['confirmation_policy'];
  effort?: string;
  executionMode?: MessageBehavior['execution_mode'];
  model?: string;
  provider?: string;
}

export function renderComposer({
  attachments = false,
  contextReferences = false,
  modelOptions,
  onBehaviorChange,
  onCommand = vi.fn(async () => undefined),
  onOpenReference,
  onPrepareFiles,
  onDiscardFiles,
  onStop = vi.fn(),
  onSubmit = vi.fn(async () => undefined),
  state = 'completed',
  workspaceId,
  ...initialSelection
}: ComposerSelection & {
  attachments?: boolean;
  contextReferences?: boolean;
  modelOptions?: ClioComposerProps['modelOptions'];
  onBehaviorChange?: ClioComposerProps['onBehaviorChange'];
  onCommand?: (value: { commandId: string; input: string }) => Promise<void>;
  onOpenReference?: ClioComposerProps['onOpenReference'];
  onPrepareFiles?: ClioComposerProps['onPrepareFiles'];
  onDiscardFiles?: ClioComposerProps['onDiscardFiles'];
  onStop?: () => void;
  onSubmit?: ClioComposerProps['onSubmit'];
  state?: 'completed' | 'running';
  workspaceId?: string;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Closes over every non-selection prop so `rerenderWith` re-renders the
  // SAME element identity with only the selection changed -- exactly what
  // workspace-page.tsx's fixed (session-only) composer key now does, instead
  // of a fresh `render()` that would prove nothing about remount behavior.
  const build = (selection: ComposerSelection = initialSelection) => (
    <QueryClientProvider client={queryClient}>
      <PromptInputProvider>
        <ClioComposer
          attachments={attachments}
          commands={commands}
          confirmationPolicy={selection.confirmationPolicy}
          contextReferences={contextReferences}
          effort={selection.effort ?? 'medium'}
          executionMode={selection.executionMode}
          model={selection.model ?? 'gpt-5.6-luna'}
          modelOptions={modelOptions}
          onBehaviorChange={onBehaviorChange}
          onCommand={onCommand}
          onOpenReference={onOpenReference}
          onPrepareFiles={onPrepareFiles}
          onDiscardFiles={onDiscardFiles}
          onStop={onStop}
          onSubmit={onSubmit}
          provider={selection.provider ?? 'codex'}
          state={state}
          workspaceId={workspaceId}
        />
      </PromptInputProvider>
    </QueryClientProvider>
  );
  const view = render(build(), { wrapper: LiveConnection });
  return {
    onCommand,
    onStop,
    onSubmit,
    rerenderWith: (selection: ComposerSelection) =>
      view.rerender(build({ ...initialSelection, ...selection })),
  };
}

/**
 * `ClioModelPicker` (mounted inside `ClioComposer`) reads the language-model
 * configuration via `useQuery`, so every render needs a `QueryClientProvider`
 * -- even the handful of tests below that render `ClioComposer` directly
 * (focus/queueing behavior) instead of through `renderComposer`.
 */
export function withTestQueryClient(node: ReactNode): ReactNode {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <LiveConnection>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </LiveConnection>
  );
}
