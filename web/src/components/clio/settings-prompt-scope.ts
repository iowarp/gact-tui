const SCOPE_LABELS: Record<string, string> = {
  builtin: 'Built-in',
  global: 'Entire service',
  workspace: 'Workspace',
  session: 'Conversation',
};

/** Where a prompt definition comes from, in words. */
export const scopeLabel = (scope: string) => SCOPE_LABELS[scope] ?? scope;
