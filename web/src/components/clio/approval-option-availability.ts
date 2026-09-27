import type { Session, SpotterAvailability } from '@clio/core/v3';
import type { SessionBehaviorOption } from './session-behavior-options';

/** One confirmation-policy option as a picker renders it right now. */
export interface ApprovalOptionView<T extends string = Session['approval_mode']>
  extends SessionBehaviorOption<T> {
  /** True when the service reports it cannot honour this option here. */
  disabled: boolean;
  /** Why the option is unavailable and what to enable; empty when available. */
  unavailableDetail: string;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : '';
}

/**
 * Apply what the service reports about each option to the confirmation-policy
 * list, so every picker offers only choices the service would accept.
 *
 * SPOTTER review is the one option with a deployment requirement: it needs its
 * watcher agent and a provenance store to read. When the service reports it
 * cannot be armed, the option stays listed (so the person learns it exists and
 * what it needs) but is disabled, and its description becomes the typed
 * reason's remedy. Unknown availability leaves it selectable; the service's
 * own refusal is then the barrier.
 */
export function approvalOptionViews<T extends string>(
  options: readonly SessionBehaviorOption<T>[],
  spotter: SpotterAvailability | undefined,
): ApprovalOptionView<T>[] {
  return options.map((option) => {
    if (option.value !== 'spotter-ai' || !spotter || spotter.available) {
      return { ...option, disabled: false, unavailableDetail: '' };
    }
    const remedy = sentence(spotter.remedy);
    return {
      ...option,
      description: remedy ? `Unavailable. To enable: ${remedy}.` : 'Unavailable here.',
      disabled: true,
      unavailableDetail: spotter.message,
    };
  });
}
