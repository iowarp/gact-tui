import type { McpAppSnapshot } from '@clio/core/v3';
import { useMemo, type ReactNode } from 'react';
import type { SnapshotOptions } from '../mcp-app-look';
import {
  SnapshotCommentSession,
  SnapshotCommentsIcon,
  SnapshotRegionLayer,
  type SnapshotCommentTarget,
} from './snapshot-comments';

/**
 * Comments on an MCP App view (CM3), through the shared snapshot comments
 * (`snapshot-comments.tsx`): each mark keeps the snapshot CLIO's sandbox document took of
 * the view when it was made (the one the agent's `look_at_view` gets, CM1), and carries the
 * view's identity and the context it had last reported then.
 */

export interface McpAppCommentTarget {
  appInstanceId: string;
  server: string;
  tool: string;
  title: string;
  resourceUri: string;
}

type Snap = (options: SnapshotOptions) => Promise<McpAppSnapshot>;

/** The comment session of one app view; its marks attach to the next message. */
export function McpAppCommentSession({
  target,
  snapshot,
  context,
  describeRegion,
  children,
}: {
  target: McpAppCommentTarget;
  /** The view's snapshot through CLIO's sandbox document, once the view is ready. */
  snapshot: () => Snap | undefined;
  /** The context the view last reported (`ui/update-model-context` params). */
  context: () => unknown;
  /** KF2: the view's `describe_region` tool, when it lists one. */
  describeRegion?: SnapshotCommentTarget['describeRegion'];
  children: ReactNode;
}) {
  const shared = useMemo<SnapshotCommentTarget>(
    () => ({
      kind: 'mcp-app',
      title: target.title,
      snapshot,
      source: () => ({
        app: {
          app_instance_id: target.appInstanceId,
          server: target.server,
          tool: target.tool,
          title: target.title,
          resource_uri: target.resourceUri,
        },
        context: context() ?? null,
      }),
      describeRegion,
    }),
    [context, describeRegion, snapshot, target],
  );
  return <SnapshotCommentSession target={shared}>{children}</SnapshotCommentSession>;
}

/** The view's one Comments icon, for its frame header. */
export const McpAppCommentsIcon = SnapshotCommentsIcon;

/** The drag layer over the view, and the session's marks pinned on it while it is open. */
export const McpAppRegionLayer = SnapshotRegionLayer;
