import type { RunState } from '@clio/core/v3';
import { CornerDownRightIcon, ListPlusIcon, SendIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import {
  PromptInputButton,
  PromptInputSubmit,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input';
import { ClioStatus } from './status';
import { useComposerDelivery } from '@/hooks/use-composer-delivery';

/** One visible send action follows the same state/modifier rule as Enter. Stop stays independent. */
export function ComposerSubmitControls({
  state,
  disabled,
  hasContent,
  onSubmit,
  onStop,
}: {
  state: RunState;
  disabled: boolean;
  hasContent: boolean;
  onSubmit: (event: MouseEvent<HTMLButtonElement>) => void;
  onStop?: () => void;
}) {
  const { delivery, label } = useComposerDelivery(state);
  const attachments = usePromptInputAttachments();
  const Icon =
    delivery === 'queued' ? ListPlusIcon : delivery === 'steer' ? CornerDownRightIcon : SendIcon;
  return (
    <>
      {state === 'waiting_permission' || state === 'waiting_user' ? (
        <ClioStatus value={state} />
      ) : null}
      <PromptInputButton
        aria-label={
          delivery === 'queued'
            ? 'Queue message'
            : delivery === 'steer'
              ? 'Steer current work'
              : 'Submit'
        }
        aria-keyshortcuts={delivery === 'steer' ? 'Control+Enter Meta+Enter' : 'Enter'}
        // Idle (nothing to send): a muted button with full-strength text, not a faded
        // primary whose light text washes out on the Notebook theme's paper.
        className="gap-1.5 disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
        disabled={disabled || (!hasContent && attachments.files.length === 0)}
        onClick={onSubmit}
        title={
          delivery === 'queued'
            ? 'Queue for after current work (Enter). Ctrl/Cmd+Enter steers instead.'
            : delivery === 'steer'
              ? 'Send feedback before the next model iteration (Ctrl/Cmd+Enter).'
              : 'Send message (Enter or Ctrl/Cmd+Enter).'
        }
        type="submit"
        variant={delivery === 'steer' ? 'outline' : 'default'}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </PromptInputButton>
      {state === 'running' || state === 'queued' ? (
        <PromptInputSubmit
          onStop={onStop}
          status={state === 'running' ? 'streaming' : 'submitted'}
        />
      ) : null}
    </>
  );
}
