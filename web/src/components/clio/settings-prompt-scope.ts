import { t } from '@lingui/core/macro';

const SCOPE_LABELS: Record<string, string> = {
  builtin: t`Built-in`,
  global: t`Entire service`,
  workspace: t`Workspace`,
  session: t`Conversation`,
};

/** Where a prompt definition comes from, in words. */
export const scopeLabel = (scope: string) => SCOPE_LABELS[scope] ?? scope;
