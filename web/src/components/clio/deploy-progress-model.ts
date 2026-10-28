import { vocab } from '@/lib/brand-vocabulary';
import type { SshStepEvent } from '@/tauri/ssh-infrastructure-transport';
import type { RecoveryProgress } from '@/tauri/ssh-recovery-progress';

export type DeployStageId =
  | 'recover'
  | 'connect'
  | 'authenticate'
  | 'detect'
  | 'claim'
  | 'install'
  | 'start'
  | 'tunnel'
  | 'open'
  | 'cleanup';

export type DeployStageState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped';

export type DeployStage = {
  id: DeployStageId;
  label: string;
  state: DeployStageState;
  /** The current substep (the installer's own `==>` line) or the failure reason. */
  detail?: string;
  /** Why a skipped stage did not run, when the deployment's own events say so. */
  skipReason?: string;
  startedAt?: number;
  endedAt?: number;
  /**
   * Listed only once it happens: authentication when OpenSSH asks something,
   * the running-server check when the agent runs it, cleanup after a failure
   * or cancel.
   */
  hidden?: boolean;
};

export type DeployProgress = {
  stages: DeployStage[];
  failure?: { stage: DeployStageId; reason: string; log?: string };
};

/** What happened, from the desktop's transport events and the deployment's own calls. */
export type DeployEvent =
  | { type: 'start'; at: number; recovery?: RecoveryProgress }
  | { type: 'recover'; done: number; total: number; at: number }
  | { type: 'prompt'; at: number }
  | { type: 'connected'; at: number }
  | {
      type: 'step';
      step: Pick<SshStepEvent, 'kind' | 'phase' | 'detail'> &
        Partial<Pick<SshStepEvent, 'started_at_ms' | 'ended_at_ms' | 'log'>>;
      at: number;
    }
  | { type: 'open'; at: number }
  | { type: 'opened'; at: number }
  | { type: 'fail'; reason: string; at: number }
  | { type: 'cancel'; at: number };

const STAGES: ReadonlyArray<Pick<DeployStage, 'id' | 'label'>> = [
  { id: 'recover', label: `Checking saved ${vocab.agent} installs` },
  { id: 'connect', label: 'Connecting over SSH' },
  { id: 'authenticate', label: 'Authenticating' },
  { id: 'detect', label: 'Detecting platform' },
  { id: 'claim', label: `Checking for a running ${vocab.agent}` },
  { id: 'install', label: `Installing ${vocab.agent}` },
  { id: 'start', label: 'Starting server' },
  { id: 'tunnel', label: 'Opening tunnel' },
  { id: 'open', label: `Connecting to ${vocab.agent}` },
  { id: 'cleanup', label: 'Cleaning up' },
];

const HIDDEN_UNTIL_RUN: ReadonlySet<DeployStageId> = new Set([
  'recover',
  'authenticate',
  'claim',
  'cleanup',
]);

const STEP_STAGE: Partial<Record<SshStepEvent['kind'], DeployStageId>> = {
  probe: 'detect',
  claim: 'claim',
  install: 'install',
  start: 'start',
  tunnel: 'tunnel',
  teardown: 'cleanup',
};

export const initialDeployProgress: DeployProgress = {
  stages: STAGES.map((stage) => ({
    ...stage,
    state: 'pending',
    hidden: HIDDEN_UNTIL_RUN.has(stage.id) ? true : undefined,
  })),
};

const order = (id: DeployStageId) => STAGES.findIndex((stage) => stage.id === id);

/**
 * Why `stage` did not run once the deployment moved on to `next`: the tunnel
 * when CLIO answered on the direct route, the install and start when the check
 * for a running CLIO finished and the deployment went straight past them (it
 * adopted that server). Otherwise unknown, and the stage only reads "Skipped".
 */
function skipReason(
  progress: DeployProgress,
  stage: DeployStage,
  next: DeployStageId,
): string | undefined {
  if (stage.id === 'tunnel' && next === 'open') return 'Not needed: connected directly';
  const claim = progress.stages.find((row) => row.id === 'claim');
  if ((stage.id === 'install' || stage.id === 'start') && claim?.state === 'done')
    return `Not needed: the ${vocab.agent} already running there was reused`;
  return undefined;
}

/**
 * Enter `id`: earlier stages that never ran (authentication with a key, a
 * tunnel the direct route did not need) are marked skipped, with the reason
 * when it is known. A stage is only ever done by its own result: an earlier
 * stage still running stays running.
 */
function enter(progress: DeployProgress, id: DeployStageId, at: number): DeployProgress {
  const target = order(id);
  return {
    ...progress,
    stages: progress.stages.map((stage, index) => {
      if (index < target && stage.state === 'pending') {
        const reason = skipReason(progress, stage, id);
        return { ...stage, state: 'skipped', ...(reason ? { skipReason: reason } : {}) };
      }
      if (index === target && stage.state !== 'running')
        return { ...stage, state: 'running', startedAt: at, endedAt: undefined, hidden: false };
      return stage;
    }),
  };
}

/**
 * The desktop's check of its saved hosts, which a deployment waits for: `2/3`
 * while it runs, then done, and the connection starts.
 */
function recover(progress: DeployProgress, check: RecoveryProgress, at: number): DeployProgress {
  const detail = `${Math.min(check.done, check.total)}/${check.total}`;
  if (check.done < check.total)
    return update(enter(progress, 'recover', at), 'recover', { detail });
  const recovering = progress.stages.find((stage) => stage.id === 'recover');
  if (recovering?.state !== 'running') return progress;
  return enter(update(progress, 'recover', { state: 'done', detail, endedAt: at }), 'connect', at);
}

function update(
  progress: DeployProgress,
  id: DeployStageId,
  change: Partial<DeployStage>,
): DeployProgress {
  return {
    ...progress,
    stages: progress.stages.map((stage) => (stage.id === id ? { ...stage, ...change } : stage)),
  };
}

/** Index of the furthest stage that has started, or -1. */
function furthestStarted(progress: DeployProgress): number {
  return progress.stages.reduce(
    (furthest, stage, index) =>
      stage.state === 'pending' || stage.state === 'skipped' ? furthest : index,
    -1,
  );
}

/** The stage a failure or cancel lands on: the running one, else the next one due. */
function currentStage(progress: DeployProgress): DeployStageId {
  const running = progress.stages.find((stage) => stage.state === 'running');
  if (running) return running.id;
  const next = progress.stages.find((stage) => stage.state === 'pending' && !stage.hidden);
  return next?.id ?? 'open';
}

export function deployProgressReducer(
  progress: DeployProgress,
  event: DeployEvent,
): DeployProgress {
  switch (event.type) {
    case 'start':
      return event.recovery
        ? recover(initialDeployProgress, event.recovery, event.at)
        : enter(initialDeployProgress, 'connect', event.at);
    case 'recover':
      return recover(progress, event, event.at);
    case 'prompt': {
      const auth = progress.stages.find((stage) => stage.id === 'authenticate');
      return auth?.state === 'running' ? progress : enter(progress, 'authenticate', event.at);
    }
    case 'connected':
      return {
        ...progress,
        stages: progress.stages.map((stage) =>
          (stage.id === 'connect' || stage.id === 'authenticate') && stage.state === 'running'
            ? { ...stage, state: 'done', endedAt: event.at }
            : stage,
        ),
      };
    case 'step': {
      const id = STEP_STAGE[event.step.kind];
      // Stages never move backwards: a later inspection (the catalog probes
      // the host again after the install) is not a new platform check.
      if (!id || order(id) < furthestStarted(progress)) return progress;
      // Times measured where the step ran, so a step that finished between
      // two output reads still shows how long it really took.
      const measured = event.step.started_at_ms ? { startedAt: event.step.started_at_ms } : {};
      const endedAt = event.step.ended_at_ms || event.at;
      const entered = enter(progress, id, event.step.started_at_ms || event.at);
      if (event.step.phase === 'running')
        return update(entered, id, {
          ...measured,
          ...(event.step.detail ? { detail: event.step.detail } : {}),
        });
      if (event.step.phase === 'done')
        return update(entered, id, {
          state: 'done',
          ...measured,
          endedAt,
          // The outcome of a check or cleanup ("Stopped an old CLIO ...").
          detail: event.step.detail || undefined,
        });
      const reason = event.step.detail || 'This step failed.';
      return {
        ...update(entered, id, { state: 'failed', detail: reason, ...measured, endedAt }),
        failure: { stage: id, reason, log: event.step.log || undefined },
      };
    }
    case 'open':
      return enter(progress, 'open', event.at);
    case 'opened':
      // The remote CLIO answered through the tunnel and the connection opened.
      return update(progress, 'open', { state: 'done', endedAt: event.at });
    case 'fail': {
      if (progress.failure) return progress;
      const id = currentStage(progress);
      const failed = update(progress, id, {
        state: 'failed',
        detail: event.reason,
        endedAt: event.at,
        hidden: false,
      });
      return { ...failed, failure: { stage: id, reason: event.reason } };
    }
    case 'cancel': {
      const running = progress.stages.find((stage) => stage.state === 'running');
      return running
        ? update(progress, running.id, { state: 'cancelled', endedAt: event.at })
        : progress;
    }
  }
}

/** One line for a failure: the last non-empty line of an error message. */
export function oneLineReason(message: string): string {
  const lines = message
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? 'The deployment failed.';
}

/** Elapsed time as `12s` or `1m 05s`. */
export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}
