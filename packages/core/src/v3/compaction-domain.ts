/** Who started a compaction: the service on its own threshold, or the user. */
export type CompactionTrigger = 'auto' | 'manual';

/** The typed reason a compaction did not produce a summary. */
export interface CompactionError {
  code: string;
  message: string;
}

/**
 * A compaction the live stream reported as started and whose summary is not in
 * the transcript yet, or one that failed.
 *
 * It is positioned where it started: `anchor_message_id` is the open turn's
 * assistant message when `turn_id` names a turn, otherwise the session's last
 * message at that moment (absent when the session had no message yet). Once the
 * summary arrives it renders from the message itself, as a `summarization`
 * injection block, and this record goes away.
 */
export interface PendingCompaction {
  compaction_id: string;
  session_id: string;
  scope: string;
  trigger: CompactionTrigger;
  /** The turn the compaction ran inside; `""` when it ran between turns. */
  turn_id: string;
  anchor_message_id?: string;
  /**
   * `running` until the service reports an outcome. `completing` means it
   * reported success but the summary block (`message_id`/`part_id`) is not
   * resident yet, so the row keeps its place instead of flickering out.
   */
  status: 'running' | 'completing' | 'failed';
  message_id?: string;
  /**
   * The transcript block that records the outcome: the summary when completing,
   * the failure notice when failed (absent when the service could not record
   * the failure, which then lives only in this row).
   */
  part_id?: string;
  error?: CompactionError;
  started_at: string;
}
