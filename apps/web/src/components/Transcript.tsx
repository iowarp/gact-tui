import { For, Show } from 'solid-js';
import type { FileDiff, Message, Part } from '@clio/core';
import './transcript.css';

export type TranscriptDensity = 'verbose' | 'normal' | 'summary';

export interface TranscriptProps {
  messages: Message[];
  density: TranscriptDensity;
  /**
   * Called when the user clicks a `file_diff` chip to open the
   * multi-buffer review pane. ChatScreen wires this through.
   */
  onOpenDiff?: (diff: FileDiff) => void;
}

function shouldRenderPart(part: Part, density: TranscriptDensity): boolean {
  if (density === 'verbose') return true;
  if (density === 'summary') {
    return part.type === 'text' || part.type === 'file_diff';
  }
  // normal: drop thinking; collapse tool_call cards to one-liners (handled below)
  return part.type !== 'thinking';
}

function PartView(props: {
  part: Part;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
}) {
  const p = props.part;
  if (p.type === 'text') {
    return <div class="trx-text">{p.text}</div>;
  }
  if (p.type === 'thinking') {
    return (
      <details class="trx-thinking">
        <summary>thinking</summary>
        <pre>{p.text}</pre>
      </details>
    );
  }
  if (p.type === 'tool_call') {
    if (props.density === 'normal') {
      return (
        <div class="trx-toolcall trx-toolcall--collapsed" data-testid={`toolcall-${p.id}`}>
          <span class="trx-toolcall__icon">▸</span>
          <span class="trx-toolcall__name">{p.tool_name}</span>
          <span class="trx-toolcall__args">
            ({Object.keys(p.input ?? {}).slice(0, 2).join(', ')})
          </span>
        </div>
      );
    }
    return (
      <div class="trx-toolcall" data-testid={`toolcall-${p.id}`}>
        <div class="trx-toolcall__head">
          <span class="trx-toolcall__icon">▸</span>
          <span class="trx-toolcall__name">{p.tool_name}</span>
        </div>
        <pre class="trx-toolcall__body">{JSON.stringify(p.input ?? {}, null, 2)}</pre>
      </div>
    );
  }
  if (p.type === 'tool_result') {
    return (
      <div class={'trx-toolresult ' + (p.is_error ? 'trx-toolresult--err' : '')}>
        <span class="trx-toolresult__icon">⎿</span>
        <pre>{p.output ?? ''}</pre>
      </div>
    );
  }
  if (p.type === 'file_diff') {
    const stats = (() => {
      const ud = p.unified_diff ?? '';
      const adds = ud.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
      const dels = ud.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
      return { adds, dels };
    })();
    return (
      <button
        type="button"
        class="trx-filediff"
        data-testid="filediff-chip"
        onClick={() => props.onOpenDiff?.(p)}
        title="Open diff pane"
      >
        <div class="trx-filediff__chip">
          <span class="trx-filediff__path">{p.path}</span>
          <span class="trx-filediff__stats">
            <span class="trx-filediff__plus">+{stats.adds}</span>
            <span class="trx-filediff__minus">−{stats.dels}</span>
          </span>
        </div>
        <Show when={props.density === 'verbose' && p.unified_diff}>
          <pre class="trx-filediff__diff">{p.unified_diff}</pre>
        </Show>
      </button>
    );
  }
  return null;
}

function MessageView(props: {
  msg: Message;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
}) {
  return (
    <article class={'trx-msg trx-msg--' + props.msg.role} data-testid={`msg-${props.msg.id}`}>
      <div class="trx-msg__role">{props.msg.role}</div>
      <div class="trx-msg__body">
        <For each={props.msg.parts.filter((p) => shouldRenderPart(p, props.density))}>
          {(part) => (
            <PartView
              part={part}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
            />
          )}
        </For>
      </div>
    </article>
  );
}

export function Transcript(props: TranscriptProps) {
  return (
    <div class="trx" data-density={props.density} data-testid="transcript">
      <For each={props.messages}>
        {(m) => (
          <MessageView msg={m} density={props.density} onOpenDiff={props.onOpenDiff} />
        )}
      </For>
    </div>
  );
}
