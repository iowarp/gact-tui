/** One server-declared semantic block in a transcript tool result. */
export interface ToolPresentationBlock {
  id: string;
  type: 'text' | 'markdown' | 'code' | 'diff' | 'terminal' | 'link' | 'check' | 'media' | 'item';
  media_type?: string;
  text?: string;
  label?: string;
  language?: string;
  target?: 'artifact' | 'resource' | 'session' | 'url' | 'file' | 'work';
  state?: 'pending' | 'in_progress' | 'completed';
  previous_state?: 'pending' | 'in_progress' | 'completed';
  change?: 'added' | 'removed' | 'status_changed' | 'unchanged';
  uri?: string;
  command?: string;
  exit_code?: number | null;
  timed_out?: boolean;
  stream_offset?: number;
  content_ref?: {
    session_id: string;
    call_id: string;
    block_id: string;
    cursor: number;
    total_chars: number;
  };
  status?: string;
  detail?: string;
  duration_ms?: number;
  items?: string[];
  action_label?: string;
  result_kind?: 'snapshot' | 'completion' | 'message';
  severity?: 'info' | 'warning' | 'error';
}

/** Server-declared presentation grammar for one tool invocation. */
export interface ToolPresentation {
  action?: string;
  subject?: string;
  status?: string;
  summary: string;
  blocks: ToolPresentationBlock[];
  diagnostic?: string;
}
