import type { RunState } from '@clio/core/v3';
import { ArrowUpIcon, ListPlusIcon, SquareIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useComposerDelivery } from '@/hooks/use-composer-delivery';
import { useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { IconButton } from './primitives/icon-button';
import { TOOLTIP_KEY } from './primitives/tooltip-key';
import { ClioStatus } from './status';

/**
 * The 28px square the row ends with, filled so it reads as the primary action.
 * Its dark hover is restated: the ghost variant's `dark:hover:bg-muted/50`
 * would otherwise win in dark and the tile would fade out under the pointer.
 */
const SQUARE =
  'size-7 rounded-[8px] border-0 bg-foreground/10 text-foreground hover:bg-foreground/15 hover:text-foreground dark:hover:bg-foreground/15 disabled:bg-foreground/5 disabled:text-muted-foreground disabled:opacity-100 [&_svg:not([class*=size-])]:size-3.5';

/**
 * The row's one square. With nothing typed while work runs it stops the run
 * (Esc); with text it queues (Enter), or steers while Ctrl/⌘ is held; with
 * nothing running it sends. The glyph follows the same rule as the keys.
 */
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
  const { delivery } = useComposerDelivery(state);
  const attachments = usePromptInputAttachments();
  const sendable = hasContent || attachments.files.length > 0;
  const stoppable = state === 'running' || state === 'queued';
  return (
    <>
      {state === 'waiting_permission' || state === 'waiting_user' ? (
        <ClioStatus className="shrink-0 px-1 whitespace-nowrap" value={state} />
      ) : null}
      {stoppable && !sendable ? (
        <IconButton
          className={SQUARE}
          disabled={!onStop}
          icon={<SquareIcon className="size-3 fill-current" />}
          label="Stop"
          onClick={onStop}
          shortcut="stop"
          shortcutSide="above-icon"
          tooltipSide="top"
          type="button"
        />
      ) : state !== 'running' ? (
        <IconButton
          className={SQUARE}
          disabled={disabled || !sendable}
          icon={<ArrowUpIcon />}
          label="Send"
          onClick={onSubmit}
          shortcut="send"
          shortcutSide="above-icon"
          tooltipSide="top"
          type="submit"
        />
      ) : delivery === 'steer' ? (
        <IconButton
          className={SQUARE}
          disabled={disabled}
          icon={<ArrowUpIcon />}
          label="Steer"
          onClick={onSubmit}
          shortcut="steer"
          shortcutSide="above-icon"
          tooltipSide="top"
          type="submit"
        />
      ) : (
        <QueueButton disabled={disabled} onSubmit={onSubmit} />
      )}
    </>
  );
}
/** Queue names both keys: Enter queues, Ctrl/⌘ Enter steers the running turn. */
function QueueButton({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const send = useShortcutPresentation('send');
  const steer = useShortcutPresentation('steer');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          aria-keyshortcuts={[send?.aria, steer?.aria].filter(Boolean).join(' ') || undefined}
          className={SQUARE}
          disabled={disabled}
          icon={<ListPlusIcon />}
          label="Queue"
          onClick={onSubmit}
          tooltip={false}
          type="submit"
        />
      </TooltipTrigger>
      <TooltipContent
        className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 px-2 py-1 text-[11.5px] font-medium"
        side="top"
        sideOffset={4}
      >
        <span>Queue</span>
        <kbd className={TOOLTIP_KEY}>{send?.text}</kbd>
        <span>Steer instead</span>
        <kbd className={TOOLTIP_KEY}>{steer?.text}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}
