import type { MessageBehavior } from '@clio/core/v3';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  effectiveReasoningEffort,
  knownReasoningEffort,
  type ModelReasoningLevels,
} from '@/lib/reasoning-levels';
import { t } from '@lingui/core/macro';

interface BehaviorSelection {
  behavior: MessageBehavior;
  authoritativeConfirmationPolicy: MessageBehavior['confirmation_policy'];
  authoritativeExecutionMode: MessageBehavior['execution_mode'];
  authoritativeEffort: string | undefined;
  /** The person picked a level in this mount; a late session value never overrides it. */
  effortPicked: boolean;
}

/**
 * The approval policy, execution mode and reasoning effort the next message is
 * sent with. The session's values apply until the person changes one here; a
 * later change from the session replaces a value the person has not touched.
 * A policy or mode change is stored on the session, and a rejected change
 * returns to the previous behavior with an error toast.
 */
export function useComposerBehavior({
  confirmationPolicy,
  executionMode,
  effort,
  reasoning,
  onBehaviorChange,
}: {
  confirmationPolicy: MessageBehavior['confirmation_policy'];
  executionMode: MessageBehavior['execution_mode'];
  /** The session's reasoning level, as the service reports it. */
  effort: string | undefined;
  /** The levels the selected model offers. */
  reasoning: ModelReasoningLevels | undefined;
  onBehaviorChange?: (behavior: MessageBehavior) => Promise<void>;
}) {
  const [selection, setSelection] = useState<BehaviorSelection>(() => ({
    behavior: {
      confirmation_policy: confirmationPolicy,
      execution_mode: executionMode,
      // The person's explicit choice only; the model's own default fills in below.
      reasoning_effort: knownReasoningEffort(effort),
    },
    authoritativeConfirmationPolicy: confirmationPolicy,
    authoritativeExecutionMode: executionMode,
    authoritativeEffort: effort,
    effortPicked: false,
  }));
  const behavior: MessageBehavior = {
    ...selection.behavior,
    confirmation_policy:
      selection.authoritativeConfirmationPolicy === confirmationPolicy
        ? selection.behavior.confirmation_policy
        : confirmationPolicy,
    execution_mode:
      selection.authoritativeExecutionMode === executionMode
        ? selection.behavior.execution_mode
        : executionMode,
    reasoning_effort:
      selection.effortPicked || selection.authoritativeEffort === effort
        ? selection.behavior.reasoning_effort
        : // A changed session effort is the person's own (the service projects
          // only user-sourced levels); absent means nothing is picked.
          knownReasoningEffort(effort),
  };
  const recorded = (next: MessageBehavior, effortPicked: boolean): BehaviorSelection => ({
    behavior: next,
    authoritativeConfirmationPolicy: confirmationPolicy,
    authoritativeExecutionMode: executionMode,
    authoritativeEffort: effort,
    effortPicked,
  });
  const setBehavior = (next: MessageBehavior, effortPicked: boolean) => {
    const previous = behavior;
    setSelection(recorded(next, effortPicked));
    if (
      !onBehaviorChange ||
      (next.execution_mode === previous.execution_mode &&
        next.confirmation_policy === previous.confirmation_policy)
    ) {
      return;
    }
    void onBehaviorChange(next).catch((error: unknown) => {
      setSelection(recorded(previous, selection.effortPicked));
      toast.error(t`Session behavior was not changed`, {
        description: error instanceof Error ? error.message : t`The service rejected the change.`,
      });
    });
  };
  // Send an explicit supported pick; the service applies configured defaults.
  const messageBehavior: MessageBehavior = {
    ...behavior,
    reasoning_effort: effectiveReasoningEffort(behavior.reasoning_effort, reasoning),
  };
  return {
    /** What the controls show and the next message sends. */
    messageBehavior,
    /**
     * Kept apart from the behavior, which must always carry a value the message
     * contract accepts. The control names this rather than showing the default as
     * though the service had asked for it.
     */
    unrecognizedEffort: effort && !knownReasoningEffort(effort) ? effort : undefined,
    /** The person changed a control. Only an effort they picked is kept as a choice. */
    choose: (next: MessageBehavior) => {
      // A mode or approval change must not freeze the displayed default as a choice.
      const picked = next.reasoning_effort !== messageBehavior.reasoning_effort;
      setBehavior(
        { ...next, reasoning_effort: picked ? next.reasoning_effort : behavior.reasoning_effort },
        picked || selection.effortPicked,
      );
    },
    /** A newly selected model: drop a pick it does not offer (its default is shown). */
    keepOfferedEffort: (levels: ModelReasoningLevels | undefined) => {
      const pick = behavior.reasoning_effort;
      if (pick && !levels?.levels.includes(pick)) {
        setSelection(recorded({ ...behavior, reasoning_effort: undefined }, false));
      }
    },
  };
}
