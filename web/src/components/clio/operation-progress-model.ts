import type {
  InfrastructureOperation,
  InfrastructureOperationEvent,
  OperationProgressPatch,
  OperationReuse,
  OperationStep,
  OperationStepProgress,
} from '@clio/core/v3';
import { formatBytes } from '@/lib/format';
import { formatElapsed } from './deploy-progress-model';

/** One live log line, keyed by its stream event id. */
export interface OperationLogEntry {
  id: number;
  line: string;
  stream: string;
}

/** What a client holds of one operation's live stream. */
export interface OperationStreamState {
  operation?: InfrastructureOperation;
  lines: OperationLogEntry[];
  /** The highest resumable event id seen: the Last-Event-ID of a reconnect. */
  cursor: number;
  /** Older log lines fell out of the service's retained window. */
  gap: boolean;
  completed: boolean;
}

/** Lines kept in memory for the log view (the terminal keeps its own scrollback). */
export const MAX_OPERATION_LOG_LINES = 5000;

export function initialOperationStream(operation?: InfrastructureOperation): OperationStreamState {
  return {
    operation,
    lines: [],
    cursor: 0,
    gap: false,
    completed: Boolean(operation && !['queued', 'running'].includes(operation.state)),
  };
}

function mergeProgress(
  operation: InfrastructureOperation,
  patch: OperationProgressPatch,
): InfrastructureOperation {
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<InfrastructureOperation>;
  return { ...operation, ...defined };
}

function sameReuse(left: OperationReuse, right: OperationReuse): boolean {
  return left.thing === right.thing && left.identity === right.identity;
}

/** Fold one stream event into the state; replayed events (id ≤ cursor) are ignored. */
export function operationStreamReducer(
  state: OperationStreamState,
  event: InfrastructureOperationEvent,
): OperationStreamState {
  if (event.id > 0 && event.id <= state.cursor) return state;
  const cursor = Math.max(state.cursor, event.id);
  switch (event.type) {
    case 'operation.snapshot':
      return { ...state, cursor, operation: event.operation };
    case 'operation.progress':
      return {
        ...state,
        cursor,
        operation: state.operation
          ? mergeProgress(state.operation, event.progress)
          : state.operation,
      };
    case 'operation.log': {
      const lines = [
        ...state.lines,
        { id: event.id, line: event.log.line, stream: event.log.stream },
      ];
      return {
        ...state,
        cursor,
        lines:
          lines.length > MAX_OPERATION_LOG_LINES ? lines.slice(-MAX_OPERATION_LOG_LINES) : lines,
      };
    }
    case 'operation.reuse': {
      const operation = state.operation;
      if (!operation || operation.reused.some((row) => sameReuse(row, event.reuse))) {
        return { ...state, cursor };
      }
      return {
        ...state,
        cursor,
        operation: { ...operation, reused: [...operation.reused, event.reuse] },
      };
    }
    case 'operation.completed':
      return { ...state, cursor, operation: event.operation, completed: true };
    case 'stream.gap':
      return { ...state, gap: true };
    default:
      return state;
  }
}

/** A measured fraction (0..1) for a determinate step; undefined means indeterminate. */
export function stepFraction(step: OperationStep): number | undefined {
  const fraction = step.progress?.fraction;
  if (!step.progress?.determinate || typeof fraction !== 'number' || !Number.isFinite(fraction)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, fraction));
}

const UNIT_LABELS: Record<NonNullable<OperationStepProgress['unit']>, string> = {
  bytes: '',
  layers: 'layers',
  packages: 'packages',
  percent: '%',
  items: 'items',
};

/** The counter a step can honestly report ("1.2 GB of 4.0 GB", "12 of 80 packages"). */
export function stepCounter(progress?: OperationStepProgress): string | undefined {
  if (!progress) return undefined;
  const parts: string[] = [];
  if (typeof progress.current === 'number') {
    if (progress.unit === 'bytes') {
      parts.push(
        typeof progress.total === 'number'
          ? `${formatBytes(progress.current)} of ${formatBytes(progress.total)}`
          : formatBytes(progress.current),
      );
    } else if (progress.unit === 'percent') {
      parts.push(`${Math.round(progress.current)}%`);
    } else {
      const unit = progress.unit ? ` ${UNIT_LABELS[progress.unit]}` : '';
      parts.push(
        typeof progress.total === 'number'
          ? `${progress.current} of ${progress.total}${unit}`
          : `${progress.current}${unit}`,
      );
    }
  }
  if (progress.detail) parts.push(progress.detail);
  return parts.length ? parts.join(' · ') : undefined;
}

/** "Reusing <thing> (<identity>); skipped <size>/~<time>", as the service words it. */
export function reuseNote(reuse: OperationReuse): string {
  if (reuse.message) return reuse.message;
  const identity = reuse.identity.length > 19 ? `${reuse.identity.slice(0, 19)}…` : reuse.identity;
  const skipped = [
    typeof reuse.size_bytes === 'number' ? formatBytes(reuse.size_bytes) : '',
    typeof reuse.saved_seconds === 'number' ? `~${formatElapsed(reuse.saved_seconds * 1000)}` : '',
  ].filter(Boolean);
  const tail = skipped.length ? `; skipped ${skipped.join('/')}` : '';
  return `Reusing ${reuse.thing} (${identity})${tail}`;
}

/** Seconds since `startedAt` (ISO) at `now`, or the recorded elapsed time once finished. */
export function operationElapsedSeconds(
  operation: Pick<InfrastructureOperation, 'started_at' | 'elapsed_seconds' | 'finished_at'>,
  now: number,
  running: boolean,
): number | undefined {
  if (running && operation.started_at) {
    const started = Date.parse(operation.started_at);
    if (Number.isFinite(started)) return Math.max(0, (now - started) / 1000);
  }
  return operation.elapsed_seconds;
}
