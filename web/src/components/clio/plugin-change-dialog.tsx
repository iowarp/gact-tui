import type { PluginChangeApply, RemovalPreview } from '@clio/core/v3';
import { useId } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { PluginChange } from '@/hooks/use-plugin-change';
import { PluginRemovalCascade } from './plugin-removal-cascade';

/** The three ways a change can reach the model, in the order the dialog offers them. */
const CHOICES: readonly { apply: PluginChangeApply; label: string; hint: string }[] = [
  { apply: 'now', label: 'Yes', hint: 'Rebuilds the prompt cache on the next call.' },
  {
    apply: 'compact',
    label: 'Yes, after compaction',
    hint: 'Compacts the conversation now; the change goes in with it.',
  },
  {
    apply: 'note',
    label: 'Yes, as an injection',
    hint: 'Tells the agent now; the prompt changes at the next compaction. Added tools are announced, not listed; removed plugins stay visible to the agent until then.',
  },
];

export interface PluginChangeDialogProps {
  /** The proposed change; `undefined` closes the dialog. */
  change?: PluginChange;
  /** Whether the conversation has messages, so a prompt cache to lose. */
  cached: boolean;
  preview?: RemovalPreview;
  previewPending: boolean;
  previewError?: string;
  /** The choice being applied, while its request runs. */
  applying?: PluginChangeApply;
  onChoose: (apply: PluginChangeApply) => void;
  onCancel: () => void;
}

/**
 * The one warning before a plugin or agent change applies: the change, the
 * cascade a removal brings, and how the change reaches the model. Nothing is
 * preselected; "No" takes the initial focus and sends nothing.
 */
export function PluginChangeDialog({
  change,
  cached,
  preview,
  previewPending,
  previewError,
  applying,
  onChoose,
  onCancel,
}: PluginChangeDialogProps) {
  const id = useId();
  // A removal applies only once its cascade is known.
  const blocked = Boolean(applying) || Boolean(change?.removing && !preview);
  return (
    <AlertDialog open={Boolean(change)} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader className="shrink-0">
          <AlertDialogTitle>
            {cached ? 'Warning' : 'Change this conversation’s plugins?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {cached
              ? 'Changing plugins changes the system prompt, which invalidates the prompt cache, so the next model call may cost more.'
              : 'This conversation has no messages yet, so nothing is cached and the change applies from the first call.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto text-sm">
          {change ? <p className="font-medium">{change.summary}</p> : null}
          {change?.removing ? (
            <PluginRemovalCascade
              plugin={change.removing}
              preview={preview}
              previewError={previewError}
              previewPending={previewPending}
            />
          ) : null}
          {cached ? (
            <>
              <p className="font-medium">Do you want to proceed?</p>
              <div
                aria-label="How the change reaches the agent"
                className="grid gap-2"
                role="group"
              >
                {CHOICES.map((choice) => (
                  <Button
                    aria-busy={applying === choice.apply}
                    aria-describedby={`${id}-${choice.apply}-hint`}
                    aria-labelledby={`${id}-${choice.apply}-label`}
                    className="h-auto justify-start py-2 text-left whitespace-normal"
                    disabled={blocked}
                    key={choice.apply}
                    onClick={() => onChoose(choice.apply)}
                    variant="outline"
                  >
                    <span className="grid gap-0.5">
                      <span className="font-medium" id={`${id}-${choice.apply}-label`}>
                        {choice.label}
                      </span>
                      <span
                        className="text-xs font-normal text-muted-foreground"
                        id={`${id}-${choice.apply}-hint`}
                      >
                        {choice.hint}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </>
          ) : null}
          {applying ? (
            <p className="flex items-center gap-2 text-muted-foreground" role="status">
              <Spinner aria-hidden="true" className="shrink-0" />
              {applying === 'compact'
                ? 'Compacting the conversation. This calls the model and can take a few seconds…'
                : 'Applying the change…'}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter className="shrink-0">
          <AlertDialogCancel disabled={Boolean(applying)}>No</AlertDialogCancel>
          {cached ? null : (
            <Button disabled={blocked} onClick={() => onChoose('now')}>
              Yes
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
