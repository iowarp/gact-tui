/**
 * Shared, BACKEND-AGNOSTIC tool-result renderer (RENDERING_SPEC §4).
 *
 * A tool result is rendered by WHAT THE CONTENT IS — image / diff / table /
 * markdown / json / text — never by the tool's NAME. The content type is
 * detected upstream by {@link detectToolResultContent}; this component picks a
 * view per type. Only the tool OUTPUT collapses (by size), with a `show raw`
 * disclosure that reveals the full underlying body for every type.
 *
 * Both render paths share this single component:
 *   - the flat assistant-turn execution flow (`AssistantTurnView`)
 *   - the per-part fallback (`TranscriptToolParts` → `ToolResultPartView`), used
 *     for user turns, plain assistant turns, and search mode.
 */
import { For, Match, Show, Switch, createMemo, createSignal } from 'solid-js';
import { CollapsibleText } from './CollapsibleContent.js';
import { MemoMarkdown } from './MemoMarkdown.js';
import { InlineWorkspaceImage } from './InlineWorkspaceImage.js';
import type { ToolResultContent } from './toolResultContent.js';

/** Resolve a workspace file path to an inline image data URL (tool artifacts). */
export type ReadWorkspaceImage = (
  path: string,
) => Promise<{ url: string; mediaType: string } | null>;

/** Tool OUTPUT is the one and only thing that collapses (RENDERING_SPEC §2). */
export const TOOL_RESULT_THRESHOLD = 6;

/**
 * Render a tool result BY ITS DETECTED CONTENT TYPE (backend-agnostic). Only the
 * tool output collapses (by size); a "show raw" disclosure reveals the full
 * underlying body for every type.
 */
export function ToolResultView(props: {
  content: ToolResultContent;
  raw: string;
  preview: string;
  readWorkspaceImage?: ReadWorkspaceImage;
}) {
  const content = () => props.content;
  const [showRaw, setShowRaw] = createSignal(false);
  const hasRaw = () => {
    const full = props.raw.trim();
    return full.length > 0 && full !== props.preview.trim() && content().kind !== 'image';
  };
  return (
    <>
      <Switch
        fallback={
          <CollapsibleText
            text={(content() as { kind: 'text'; text: string }).text}
            threshold={TOOL_RESULT_THRESHOLD}
            plain
          />
        }
      >
        <Match when={content().kind === 'image' ? (content() as { kind: 'image'; path: string }) : null}>
          {(img) => (
            <InlineWorkspaceImage path={img().path} readWorkspaceImage={props.readWorkspaceImage} />
          )}
        </Match>
        <Match when={content().kind === 'diff' ? (content() as { kind: 'diff'; diff: string }) : null}>
          {(diff) => <DiffView diff={diff().diff} />}
        </Match>
        <Match
          when={
            content().kind === 'table'
              ? (content() as Extract<ToolResultContent, { kind: 'table' }>)
              : null
          }
        >
          {(table) => <TableView table={table()} />}
        </Match>
        <Match when={content().kind === 'markdown' ? (content() as { kind: 'markdown'; text: string }) : null}>
          {(md) => (
            <div class="trx-tool__markdown">
              <MemoMarkdown text={md().text} />
            </div>
          )}
        </Match>
        <Match when={content().kind === 'json' ? (content() as { kind: 'json'; preview: string }) : null}>
          {(json) => (
            <CollapsibleText text={json().preview} threshold={TOOL_RESULT_THRESHOLD} plain />
          )}
        </Match>
      </Switch>
      <Show when={hasRaw()}>
        <button
          type="button"
          class="trx-collapse__toggle"
          data-testid="tool-raw-toggle"
          aria-expanded={showRaw()}
          onClick={(e) => {
            e.stopPropagation();
            setShowRaw((v) => !v);
          }}
        >
          {showRaw() ? 'hide raw' : 'show raw'}
        </button>
        <Show when={showRaw()}>
          <pre class="trx-tool__raw" data-testid="tool-raw-body">
            {props.raw}
          </pre>
        </Show>
      </Show>
    </>
  );
}

/** A unified-diff body with +/- line coloring (RENDERING_SPEC §4). */
export function DiffView(props: { diff: string }) {
  const lines = createMemo(() => props.diff.replace(/\n$/, '').split('\n'));
  const classFor = (line: string): string => {
    if (/^@@/.test(line)) return 'is-hunk';
    if (/^\+(?!\+\+)/.test(line)) return 'is-add';
    if (/^-(?!--)/.test(line)) return 'is-del';
    if (/^(---|\+\+\+)\s/.test(line)) return 'is-file';
    return 'is-ctx';
  };
  return (
    <pre class="trx-tool__diff" data-testid="tool-diff">
      <For each={lines()}>
        {(line) => <div class={`trx-diff-line ${classFor(line)}`}>{line || ' '}</div>}
      </For>
    </pre>
  );
}

/** A small TABLE of the columns + a few example rows (RENDERING_SPEC §4). */
export function TableView(props: { table: Extract<ToolResultContent, { kind: 'table' }> }) {
  const table = () => props.table;
  return (
    <div class="trx-tool__table-wrap" data-testid="tool-table">
      <table class="trx-tool__table">
        <thead>
          <tr>
            <For each={table().columns}>
              {(col) => (
                <th>
                  <span class="trx-tool__col-name">{col.name}</span>
                  <Show when={col.dtype}>
                    <span class="trx-tool__col-type">{col.dtype}</span>
                  </Show>
                </th>
              )}
            </For>
          </tr>
        </thead>
        <Show when={table().rows.length > 0}>
          <tbody>
            <For each={table().rows}>
              {(row) => (
                <tr>
                  <For each={table().columns}>
                    {(_, ci) => <td>{row[ci()] ?? ''}</td>}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </Show>
      </table>
      <Show when={table().rowCount != null}>
        <div class="trx-tool__table-note">
          {table().columns.length} columns
          {table().rows.length ? ` · ${table().rows.length} sample rows` : ''} ·{' '}
          {table().rowCount} rows total
        </div>
      </Show>
    </div>
  );
}
