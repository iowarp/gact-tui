import { GroundedMessageResponse } from '@/components/clio/grounded-message-response';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface RecordedPart {
  id?: string;
  type: string;
  text?: string;
  call_id?: string;
  tool_name?: string;
  tool_title?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
  duration_ms?: number;
  uri?: string;
  name?: string;
  url?: string;
}

export interface RecordedTool {
  call_id: string;
  tool?: string;
  status?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export interface SavedToolOutput {
  source_path: string;
  archive_path: string;
  bytes: number;
  text?: string;
  embedded?: boolean;
}
function outputKey(path: string) {
  const key = path.replace(/^\\\\\?\\/, '').replaceAll('\\', '/');
  return /^[a-z]:/i.test(key) ? key.toLowerCase() : key;
}

/** Read every part of a complete output without mounting megabytes of text at once. */
function SavedOutputText({ text }: { text: string }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(text.length / 12000));
  return (
    <div>
      {pages > 1 && (
        <div className="my-2 flex items-center gap-3 text-xs">
          <span>
            Complete output · page {page + 1} of {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 === pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
        {text.slice(page * 12000, (page + 1) * 12000)}
      </pre>
    </div>
  );
}

/** Render actual request/result values, rather than their telemetry envelope. */
function RecordedList({ values, outputs }: { values: unknown[]; outputs: SavedToolOutput[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(values.length / 20);
  return (
    <div>
      {pages > 1 && (
        <div className="mb-2 flex items-center gap-3 text-xs">
          <span>
            Items {page * 20 + 1}–{Math.min(values.length, (page + 1) * 20)} of {values.length}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 === pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <ul className="space-y-2">
        {values.slice(page * 20, (page + 1) * 20).map((item, i) => (
          <li key={i}>
            <RecordedValue value={item} outputs={outputs} />
          </li>
        ))}
      </ul>
    </div>
  );
}
function LoadedInstructions({ value, outputs }: { value: unknown; outputs: SavedToolOutput[] }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">Show loaded skill instructions</summary>
      {open && <RecordedValue value={value} outputs={outputs} />}
    </details>
  );
}

export function RecordedValue({
  value,
  outputs = [],
}: {
  value: unknown;
  outputs?: SavedToolOutput[];
}) {
  if (typeof value === 'string')
    return value.length > 12000 ? (
      <SavedOutputText text={value} />
    ) : (
      <GroundedMessageResponse>{value}</GroundedMessageResponse>
    );
  if (Array.isArray(value)) return <RecordedList values={value} outputs={outputs} />;
  if (value && typeof value === 'object') {
    if (
      'status' in value &&
      value.status === 'spilled' &&
      'path' in value &&
      typeof value.path === 'string'
    ) {
      const path = value.path;
      const saved = outputs.find((item) => outputKey(item.source_path) === outputKey(path));
      return saved ? (
        <div>
          {!saved.embedded && (
            <a
              className="underline"
              href={saved.archive_path.split('/').map(encodeURIComponent).join('/')}
            >
              Open complete saved output
            </a>
          )}
          {saved.embedded && <span>Complete saved output</span>}
          <span className="text-xs text-muted-foreground">
            {' '}
            · {saved.bytes.toLocaleString()} bytes
          </span>
          {saved.text !== undefined && <SavedOutputText text={saved.text} />}
        </div>
      ) : (
        <p>The complete saved output is unavailable. The recorded excerpt is retained.</p>
      );
    }
    if (
      'structuredContent' in value &&
      'content' in value &&
      Array.isArray(value.content) &&
      !value.content.length
    )
      return <RecordedValue value={value.structuredContent} outputs={outputs} />;
    const entries = Object.entries(value).filter(
      ([, item]) => item !== '' && !(Array.isArray(item) && !item.length),
    );
    if (entries.length === 1 && entries[0][0] === 'kwargs')
      return <RecordedValue value={entries[0][1]} outputs={outputs} />;
    // Tool content blocks keep their text readable and do not print empty fields.
    if ('type' in value && 'text' in value && typeof value.text === 'string')
      return <RecordedValue value={value.text} outputs={outputs} />;
    return (
      <dl className="space-y-3">
        {entries.map(([key, item]) => (
          <div key={key} className="min-w-0">
            <dt className="mb-1 text-xs font-medium capitalize text-muted-foreground">
              {key.replaceAll('_', ' ')}
            </dt>
            <dd className="break-words">
              {['command', 'cmd', 'code', 'stdout', 'stderr'].includes(key) ? (
                <SavedOutputText
                  text={typeof item === 'string' ? item : JSON.stringify(item, null, 2)}
                />
              ) : (
                <RecordedValue value={item} outputs={outputs} />
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{value === undefined ? 'Not recorded' : JSON.stringify(value)}</span>;
}

/** Keep calls and results at their recorded positions, including parallel calls. */
export function RecordedActivity({
  part,
  tools,
  outputs = [],
}: {
  part: RecordedPart;
  tools: RecordedTool[];
  outputs?: SavedToolOutput[];
}) {
  if (part.type === 'thinking' || part.type === 'injection')
    return (
      <section
        className="my-4 border-l-2 border-muted pl-4 text-sm text-muted-foreground"
        data-part={part.type}
      >
        <p className="mb-1 text-xs">
          {part.type === 'thinking' ? 'Recorded step' : 'Session instruction'}
        </p>
        <GroundedMessageResponse>{part.text ?? ''}</GroundedMessageResponse>
      </section>
    );
  if (part.type !== 'tool_call' && part.type !== 'tool_result') return null;
  const tool = tools.find((record) => record.call_id === part.call_id);
  const result = part.type === 'tool_result';
  const name = part.tool_title || part.tool_name || tool?.tool || 'Tool';
  return (
    <section className="my-3 border-l-2 border-primary/25 pl-4" data-part={part.type}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{name.replaceAll('_', ' ')}</h4>
        <p className="text-xs text-muted-foreground">
          {result ? (tool?.status ?? (part.is_error ? 'Failed' : 'Returned')) : 'Request'}
          {result && part.duration_ms ? ` · ${(part.duration_ms / 1000).toFixed(2)} s` : ''}
        </p>
      </div>
      <div
        className="max-h-72 overflow-auto rounded-lg border bg-muted/20 p-3 text-sm"
        tabIndex={0}
        aria-label={`${name} ${result ? 'output' : 'input'}`}
      >
        {result && tool?.error && (
          <p className="mb-2 whitespace-pre-wrap text-destructive">{tool.error}</p>
        )}
        {result && name === 'load_skill' ? (
          <LoadedInstructions value={tool?.output ?? part.content} outputs={outputs} />
        ) : (
          <RecordedValue
            value={result ? (tool?.output ?? part.content) : (tool?.input ?? part.input)}
            outputs={outputs}
          />
        )}
      </div>
    </section>
  );
}
