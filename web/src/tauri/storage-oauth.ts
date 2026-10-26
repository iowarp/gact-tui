import type { ClioRepository } from '@clio/core/v3';
import { receiveBrowserSignIn } from './oauth';

/** Receive provider consent on this Desktop and complete it only on the initiating CLIO. */
export async function signInToStorage(
  repository: Pick<ClioRepository, 'startSourceSignIn' | 'completeSourceSignIn'>,
  workspaceId: string,
  sourceId: string,
  provider: string,
  signal: AbortSignal,
): Promise<void> {
  await receiveBrowserSignIn({
    provider,
    signal,
    start: (redirectUri) => repository.startSourceSignIn(workspaceId, sourceId, redirectUri),
    complete: async (flow, callback) => {
      await repository.completeSourceSignIn(workspaceId, sourceId, flow.flow_id, callback);
    },
  });
}
