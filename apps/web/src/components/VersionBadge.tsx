/**
 * UI component: Version Badge. Exports `VersionBadge`.
 */
import { APP_DIRTY, APP_VERSION } from '../build-info.js';
import './version-badge.css';

/**
 * A small fixed corner badge showing the build version (the repo-wide
 * `git describe` stamp), so you can confirm which build you're running — the
 * same signal the TUI shows on its splash. Renders in the warning colour with a
 * `-dirty` stamp when built from a working tree with uncommitted changes ("am I
 * running exactly what's committed?"). Pointer-events are disabled so it never
 * intercepts clicks. Props override the build globals for testing.
 */
export function VersionBadge(props: { version?: string; dirty?: boolean }) {
  const version = () => props.version ?? APP_VERSION;
  const dirty = () => props.dirty ?? APP_DIRTY;
  return (
    <div
      class={'app-version-badge' + (dirty() ? ' app-version-badge--dirty' : '')}
      data-testid="app-version-badge"
      title={
        dirty()
          ? 'Built from a working tree with uncommitted changes'
          : 'Build version'
      }
    >
      {version()}
    </div>
  );
}
