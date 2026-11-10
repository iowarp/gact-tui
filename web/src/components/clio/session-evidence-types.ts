import type {
  Artifact,
  AsyncProcess,
  SessionDiff,
  SubagentRun,
  WorkspaceResource,
} from '@clio/core/v3';
import type { TaskPageControls } from './async-task-list';
import type { SubagentOpenTarget } from './subagent-card';

/** What a session's recorded work rows can open or control. */
export interface SessionEvidenceActions {
  workPages?: TaskPageControls;
  onCancelTask?: (task: AsyncProcess) => Promise<void>;
  onControlTask?: (task: AsyncProcess, action: 'pause' | 'resume' | 'restart') => Promise<void>;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenDiff?: (diff: SessionDiff) => void;
  onOpenFile?: (path: string) => void;
  onOpenResource?: (resource: WorkspaceResource) => void;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  /** Open a flow run's view: a task that runs a flow opens its run, not a chat. */
  onOpenFlow?: (handle: string, title: string) => void;
  onOpenWork?: () => void;
  onOpenActivity?: () => void;
}
