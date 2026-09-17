import type { Artifact } from '@clio/core/v3';
import { useEffect } from 'react';

/**
 * Live callbacks the `openArtifact` catalog function needs — the same lookup
 * `use-a2ui-local-actions.ts` used to perform inline, now reached from a
 * catalog function instead of a hand-rolled local-action branch
 * (`docs/design/a2ui-compat-campaign-2026-09.md` S6: "every deleted vehicle
 * keeps its feature").
 *
 * A2UI catalog functions execute outside React (`FunctionImplementation.execute`,
 * `@a2ui/web_core`), so they cannot read component state or props directly.
 * The single workspace route that owns `artifacts`/`openArtifact`
 * (`web/src/routes/workspace-page.tsx`, the only caller of
 * `useA2uiOpenArtifactRuntime`) registers itself here; the app shows one
 * workspace route at a time, so "last registered wins" reflects the real UI,
 * not a shortcut.
 */
export interface A2uiOpenArtifactRuntime {
  sessionId: string;
  findArtifact: (uri: string) => Artifact | undefined;
  onOpenArtifact: (artifact: Artifact) => void;
}

/**
 * The bare id inside an `artifact://artifact_XXX` URI, mirroring
 * `a2ui-artifact.tsx`'s own extraction — `openArtifact`'s sole declared arg
 * is `uri` (the official catalog function contract), so matching "by id" (as
 * the deleted `use-a2ui-local-actions.ts` did against `artifact_id` /
 * `artifactId` / `id` context keys) means deriving the id from the URI the
 * same way, not accepting extra undeclared args.
 */
function artifactIdFromUri(uri: string): string | undefined {
  const value = uri.startsWith('artifact://') ? uri.slice('artifact://'.length) : uri;
  return value.startsWith('artifact_') && !value.includes('/') ? value : undefined;
}

let activeRuntime: A2uiOpenArtifactRuntime | undefined;

export function setActiveA2uiOpenArtifactRuntime(
  runtime: A2uiOpenArtifactRuntime | undefined,
): void {
  activeRuntime = runtime;
}

export function activeA2uiOpenArtifactRuntime(): A2uiOpenArtifactRuntime | undefined {
  return activeRuntime;
}

/**
 * Registers the live artifact-opening runtime for the currently viewed
 * session's `openArtifact` catalog function, for as long as the calling
 * component stays mounted.
 */
export function useA2uiOpenArtifactRuntime(
  artifacts: Readonly<Record<string, Artifact>>,
  sessionId: string,
  onOpenArtifact: (artifact: Artifact) => void,
): void {
  useEffect(() => {
    const runtime: A2uiOpenArtifactRuntime = {
      sessionId,
      findArtifact: (uri) => {
        const id = artifactIdFromUri(uri);
        return Object.values(artifacts).find(
          (candidate) =>
            candidate.session_id === sessionId &&
            (candidate.uri === uri || (id !== undefined && candidate.id === id)),
        );
      },
      onOpenArtifact,
    };
    setActiveA2uiOpenArtifactRuntime(runtime);
    return () => {
      if (activeA2uiOpenArtifactRuntime() === runtime) setActiveA2uiOpenArtifactRuntime(undefined);
    };
  }, [artifacts, sessionId, onOpenArtifact]);
}
