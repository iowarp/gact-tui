import { type ReactNode } from 'react';
import type { ClioRepository } from '@clio/core/v3';
import { RepositoryOverride } from './repository-override-context';

/** A real alternate transport for offline, read-only archives. */
export function RepositoryOverrideProvider({
  repository,
  children,
}: {
  repository: ClioRepository;
  children: ReactNode;
}) {
  return <RepositoryOverride.Provider value={repository}>{children}</RepositoryOverride.Provider>;
}
