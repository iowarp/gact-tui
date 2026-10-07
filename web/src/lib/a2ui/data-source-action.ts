import type { A2uiClientAction } from '@a2ui/web_core/v0_9';

export interface DataSourceIntent {
  provider: 'github' | 'google_drive' | 'globus';
  clioId: string;
  workspaceId: string;
}

/** Only declared source-login actions can enter trusted account UI. */
export function dataSourceIntent(action: A2uiClientAction): DataSourceIntent | undefined {
  if (!action.name.startsWith('data_source/')) return undefined;
  const provider = action.name.slice('data_source/login/'.length);
  if (
    !action.name.startsWith('data_source/login/') ||
    !['github', 'google_drive', 'globus'].includes(provider)
  ) {
    throw new Error('This data-source action is not supported.');
  }
  const context = action.context;
  if (context && Object.keys(context).some((key) => !['clio_id', 'workspace_id'].includes(key))) {
    throw new Error('Private sign-in actions accept only workspace ownership details.');
  }
  if (
    !context ||
    typeof context.clio_id !== 'string' ||
    !context.clio_id ||
    typeof context.workspace_id !== 'string' ||
    !context.workspace_id
  ) {
    throw new Error('This sign-in action has no workspace owner.');
  }
  return {
    provider: provider as DataSourceIntent['provider'],
    clioId: context.clio_id,
    workspaceId: context.workspace_id,
  };
}
