import type { Session, SpotterAvailability } from '@clio/core/v3';
import type { SessionBehaviorOption } from './session-behavior-options';

/** One confirmation-policy option as a picker renders it right now. */
export interface ApprovalOptionView<T extends string = Session['approval_mode']>
  extends SessionBehaviorOption<T> {
  /** True when the service reports it cannot honour this option here. */
  disabled: boolean;
  /** Optional service diagnostic; empty when available. */
  unavailableDetail: string;
}

/**
 * One short notice naming confirmation policies unavailable here, for pickers
 * (native selects) whose items cannot carry a
 * description. Empty when every option is available.
 */
export function unavailableApprovalNotice<T extends string>(
  options: readonly ApprovalOptionView<T>[],
): string {
  return options
    .filter((option) => option.disabled)
    .map((option) => `${option.label}: ${option.description}`)
    .join(' ');
}

/**
 * Apply what the service reports about each option to the confirmation-policy
 * list, so every picker offers only choices the service would accept.
 *
 * SPOTTER review is the one option with a deployment requirement: it needs its
 * watcher agent and a provenance store to read. When the service reports it
 * cannot be armed, the option stays listed (so the person learns it exists and
 * what it does) but is disabled. Technical setup details stay out of the menu
 * description. Unknown availability leaves it selectable; the service's
 * own refusal is then the barrier.
 */
export function approvalOptionViews<T extends string>(
  options: readonly SessionBehaviorOption<T>[],
  spotter: SpotterAvailability | undefined,
): ApprovalOptionView<T>[] {
  return options.map((option) => {
    if (option.value !== 'spotter-ai' || !spotter) {
      return { ...option, disabled: false, unavailableDetail: '' };
    }
    if (spotter.available) {
      return { ...option, disabled: false, unavailableDetail: '' };
    }
    return {
      ...option,
      description: 'Not available here.',
      disabled: true,
      unavailableDetail: spotter.message,
    };
  });
}
