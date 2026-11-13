import { t } from '@lingui/core/macro';

/** The Workspace scope's line under a page title, naming the workspace. */
export function workspaceScopeLine(name: string) {
  return t`${name}, applies to every conversation in this workspace`;
}
