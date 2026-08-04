import './fresh-state.css';

/**
 * The fresh/idle-session pieces from the prototype's "New session" screen —
 * measured from design/prototype/Clio Session.html (emptyGreeting,
 * emptyStarted, emptySuggest/emptyStarters state). All three render inside
 * the SAME scrolling 860px column as the composer (SessionView.tsx), never
 * as a standalone page.
 */

export interface FreshHeadlineProps {
  /** Omitted when no workspace is known yet — never invent a path. */
  workspaceLabel?: string;
}

/** The rust glyph + "Ready on {workspace}" greeting, shown before any turn. */
export function FreshHeadline({ workspaceLabel }: FreshHeadlineProps) {
  return (
    <div className="fresh-headline">
      <span className="fresh-headline__glyph" aria-hidden="true">
        ✻
      </span>
      <h1 className="fresh-headline__text">
        {workspaceLabel ? `Ready on ${workspaceLabel}` : 'Ready'}
      </h1>
    </div>
  );
}

export interface FreshStartingProps {
  hostLabel: string;
}

/**
 * Replaces the headline for the brief optimistic window between hitting send
 * and the transcript actually taking over — the prototype's pulsing
 * "starting the session on {host}" line (emptyStarted).
 */
export function FreshStarting({ hostLabel }: FreshStartingProps) {
  return (
    <div className="fresh-starting" role="status">
      <span className="fresh-starting__glyph" aria-hidden="true">
        ✻
      </span>
      <span>starting the session on {hostLabel}</span>
    </div>
  );
}

export interface FreshStarter {
  text: string;
  meta: string;
}

export interface SuggestedPromptsProps {
  starters: FreshStarter[];
  onUse: (text: string) => void;
}

/**
 * The prototype's SUGGESTED block — three static starter prompts (its OWN
 * source has no backend generator for these either); clicking one fills the
 * composer with its title text verbatim.
 */
export function SuggestedPrompts({ starters, onUse }: SuggestedPromptsProps) {
  return (
    <div className="fresh-suggested" data-testid="suggested-prompts">
      <div className="fresh-suggested__label">
        <span className="fresh-suggested__diamond" aria-hidden="true">
          ✧
        </span>{' '}
        suggested
      </div>
      {starters.map((starter) => (
        <button
          type="button"
          key={starter.text}
          className="fresh-suggested__row"
          onClick={() => onUse(starter.text)}
        >
          <span className="fresh-suggested__title">{starter.text}</span>
          <span className="fresh-suggested__meta">{starter.meta}</span>
        </button>
      ))}
    </div>
  );
}
