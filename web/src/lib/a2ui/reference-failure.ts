import { TransportError } from '@clio/core/v3';
import { t } from '@lingui/core/macro';

/**
 * One typed, plain-language reason a referenced file cannot be shown. `code`
 * is stable (tests and diagnostics key on it); `message` is what the card
 * says, in product language, never a raw URI or wire vocabulary.
 */
export interface A2uiReferenceFailure {
  code: string;
  message: string;
}

const MESSAGES: Record<string, string> = {
  session_unavailable: t`This view is not attached to a conversation, so its files cannot be loaded.`,
  reference_not_found: t`This file is not registered on the connected service.`,
  not_found: t`The connected service no longer has this file.`,
  reference_uri_invalid: t`This reference does not name a file the service recognizes.`,
  reference_workspace_unresolved: t`This file belongs to a workspace this conversation cannot reach.`,
  authentication_required: t`The connected service did not accept this viewer’s access token.`,
  forbidden: t`The connected service refused access to this file.`,
  path_outside_workspace: t`The connected service refused access to this file.`,
  integrity_violation: t`The saved file no longer matches its recorded contents.`,
  resource_not_ready: t`This file is still uploading or being processed.`,
  unreachable: t`The connected service could not be reached to load this file.`,
  undisplayable: t`The file was retrieved but could not be displayed here.`,
};

/** Wording for a failure code the service or the renderer reported. */
export function referenceFailure(code: string, fallback?: string): A2uiReferenceFailure {
  return { code, message: MESSAGES[code] ?? fallback ?? t`This file could not be loaded.` };
}

/** Classifies a resolve/read error into a typed, plain reason. */
export function describeReferenceError(error: unknown): A2uiReferenceFailure {
  if (error instanceof TransportError) {
    if (error.code && MESSAGES[error.code]) return referenceFailure(error.code);
    if (error.status === 401) return referenceFailure('authentication_required');
    if (error.status === 403) return referenceFailure('forbidden');
    if (error.status === 404) return referenceFailure('not_found');
    if (error.status === undefined) return referenceFailure('unreachable');
    return referenceFailure(error.code ?? `http_${error.status}`, error.message);
  }
  return referenceFailure('unreachable', error instanceof Error ? error.message : undefined);
}
