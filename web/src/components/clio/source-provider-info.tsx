import type { SourceProvider } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import { InfoTip } from './info-tip';
import { t, ph } from '@lingui/core/macro';

/** One explanation follows each provider across Settings and workspace attachment. */
export function SourceProviderInfo({ provider }: { provider: SourceProvider }) {
  const { agent } = vocab;
  const descriptions: Record<string, string> = {
    obsidian: t`Build a knowledge graph from Markdown notes, links, tags and aliases. Create a new vault in ${agent} or connect an existing notes folder; no Obsidian installation or account is required. Obsidian is a popular knowledge app you can use to open and review the same vault and graph. Its optional paid cross-device Sync service can also be managed by ${agent}.`,
    google_drive: t`Connect files and folders from Google Drive. Sign in to access your account, then choose the data to connect to a workspace.`,
    ndp: t`Find datasets in National Data Platform catalogs, then download a copy or link selected resources. NDP originals cannot be changed through this connection. Sign in for protected data.`,
    globus: t`Browse collections and transfer data through Globus. Sign in to your account, then connect a collection or folder to a workspace.`,
    github: t`Connect a repository folder at a chosen branch, tag or commit. Public repositories work without signing in; sign in for private repositories.`,
    sftp: t`Connect a folder on an SSH host using SFTP. Choose a saved host or set up a new connection, then select its folder.`,
    local: t`Connect a folder already on the host running ${agent}. Choose which folder the workspace can access.`,
  };
  const description = descriptions[provider.id];
  return description ? (
    <InfoTip label={t`About ${ph({ name: provider.name })}`}>{description}</InfoTip>
  ) : null;
}
