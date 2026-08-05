import { useState } from 'react';
import { formatDurationSeconds } from '../../wire/formatters';
import { normalizeWhitespace, truncate } from '../../wire/presentationUtils';
import type { WirePart } from '../registry';
import { extractToolResultText } from './toolResultText';

export interface ToolPartProps {
  call: WirePart;
  /** Absent while the call is still in flight — no result has arrived yet. */
  result?: WirePart;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

const ARG_HINT_MAX = 42;
const PREVIEW_MAX = 96;

function firstArgHint(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '…';
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return '…';
  const [, value] = entries[0]!;
  const rendered = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  return truncate(normalizeWhitespace(rendered), ARG_HINT_MAX);
}

function argRows(input: unknown): Array<{ k: string; v: string }> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
  return Object.entries(input as Record<string, unknown>).map(([k, v]) => ({
    k,
    v: typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v)),
  }));
}

/**
 * A JSON-object tool result rendered as the prototype's key/value result
 * table (isToolSeg's "results tables") instead of a raw JSON blob. Only a
 * top-level OBJECT becomes rows — arrays and scalars keep the verbatim
 * `<pre>`, and anything unparseable falls through untouched. Presentation
 * only: every key and value from the wire still renders, nothing is dropped.
 */
function resultRows(text: string): Array<{ k: string; v: string }> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || trimmed.length > 20000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => ({
    k,
    v: typeof v === 'string' ? v : (JSON.stringify(v, null, 1) ?? String(v)),
  }));
}

/**
 * The prototype's isToolSeg row (design/prototype/Clio Session.html:391) — ONE
 * collapsible line per call, not two permanently-open cards. Closed by
 * default: the header carries the name(argHint), duration, and ✓/✗ mark; a
 * chevron opens a bordered well with the full params and the FULL result
 * text. A one-line preview still shows while closed so the row isn't empty,
 * but nothing is ever cut mid-token the way the old always-open card did —
 * the full text is always one click away, never silently truncated.
 */
export function ToolPart({ call, result }: ToolPartProps) {
  const [open, setOpen] = useState(false);
  const name = str(call['tool_name'] ?? call['name']);
  const argHint = firstArgHint(call['input']);
  const params = argRows(call['input']);
  const isError = result ? result['is_error'] === true : false;
  const durationMs = typeof result?.['duration_ms'] === 'number' ? (result['duration_ms'] as number) : undefined;
  const meta = durationMs !== undefined ? `${formatDurationSeconds(durationMs)}s` : '';
  const mark = result ? (isError ? '✗' : '✓') : '';
  const text = result ? extractToolResultText(result) : '';
  const previewLine = !open && text ? truncate(normalizeWhitespace(text), PREVIEW_MAX) : '';

  return (
    <div className="part-toolrow" data-error={isError ? 'true' : undefined} data-testid="part-tool">
      <button
        type="button"
        className="part-toolrow__head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="part-toolrow__namewrap">
          <span className="part-toolrow__name">{name}</span>
          <span className="part-toolrow__hint">({argHint})</span>
        </span>
        <span className="part-toolrow__spacer" />
        {!result ? <span className="part-toolrow__pending">running…</span> : null}
        {meta ? <span className="part-toolrow__meta" data-error={isError ? 'true' : undefined}>{meta}</span> : null}
        {mark ? (
          <span className="part-toolrow__mark" data-error={isError ? 'true' : undefined}>
            {mark}
          </span>
        ) : null}
        <span className="part-toolrow__chev" data-open={open ? 'true' : undefined} aria-hidden="true">
          ▸
        </span>
      </button>
      {previewLine ? <p className="part-toolrow__preview">{previewLine}</p> : null}
      {open ? (
        <div className="part-toolrow__well" data-error={isError ? 'true' : undefined}>
          {params.length > 0 ? (
            <div className="part-toolrow__grid">
              {params.map((row) => (
                <div className="part-toolrow__row" key={row.k}>
                  <span className="part-toolrow__k">{row.k}</span>
                  <span className="part-toolrow__v">{row.v}</span>
                </div>
              ))}
            </div>
          ) : null}
          {result ? (
            (() => {
              const rows = resultRows(text);
              if (rows) {
                return (
                  <div className="part-toolrow__grid" data-testid="part-tool-result-table">
                    {rows.map((row) => (
                      <div className="part-toolrow__row" key={row.k}>
                        <span className="part-toolrow__k">{row.k}</span>
                        <span className="part-toolrow__v">{row.v}</span>
                      </div>
                    ))}
                  </div>
                );
              }
              return <pre className="part-toolrow__result">{text || '(empty result)'}</pre>;
            })()
          ) : (
            <p className="part-toolrow__waiting">waiting for the tool to return…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
