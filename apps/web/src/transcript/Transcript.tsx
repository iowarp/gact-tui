import type { Message } from '@clio/core';
import { PartCard } from '../kit';
import { ArtifactGrid } from './parts/ArtifactChip';
import { ToolPart } from './parts/ToolPart';
import { PART_RENDERERS, WrenchGlyph, type WirePart } from './registry';
import './transcript.css';

export interface TranscriptProps {
  messages: Message[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

type PartGroup =
  | { key: string; kind: 'part'; part: WirePart }
  | { key: string; kind: 'tool'; call: WirePart; result?: WirePart }
  | { key: string; kind: 'artifacts'; parts: WirePart[] };

function toolCallId(part: WirePart): string {
  return str(part['call_id']) || str(part['id']);
}

function toolResultCallId(part: WirePart): string {
  return str(part['call_id']) || str(part['tool_call_id']);
}

/**
 * Groups a message's parts before rendering — the pairing pass Transcript
 * owns so the registry stays one-kind-one-renderer.
 *
 * A `tool_call` and the `tool_result` that answers it are two separate wire
 * parts (matched by `call_id`) but ONE row in the prototype (isToolSeg), so
 * they merge into one group here. A run of `resource_link` parts is the
 * prototype's "artifacts (N)" grid, so consecutive ones merge too. Nothing
 * is ever dropped: an unmatched tool_result or a lone resource_link still
 * gets its own group, just a group of one.
 */
function groupParts(parts: WirePart[], messageId: string): PartGroup[] {
  const groups: PartGroup[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < parts.length; i++) {
    if (consumed.has(i)) continue;
    const part = parts[i]!;
    const key = `${messageId}:${i}`;

    if (part.type === 'tool_call') {
      const callId = toolCallId(part);
      let resultIndex = -1;
      if (callId) {
        for (let j = i + 1; j < parts.length; j++) {
          if (consumed.has(j)) continue;
          const candidate = parts[j]!;
          if (candidate.type === 'tool_result' && toolResultCallId(candidate) === callId) {
            resultIndex = j;
            break;
          }
        }
      }
      if (resultIndex >= 0) {
        consumed.add(resultIndex);
        groups.push({ key, kind: 'tool', call: part, result: parts[resultIndex]! });
      } else {
        groups.push({ key, kind: 'tool', call: part });
      }
      continue;
    }

    if (part.type === 'resource_link') {
      const run = [part];
      let j = i + 1;
      while (j < parts.length && !consumed.has(j) && parts[j]!.type === 'resource_link') {
        run.push(parts[j]!);
        consumed.add(j);
        j++;
      }
      groups.push({ key, kind: 'artifacts', parts: run });
      continue;
    }

    groups.push({ key, kind: 'part', part });
  }

  return groups;
}

/**
 * The transcript — ONE pipeline from wire parts to rendered parts.
 *
 * Every part goes through the same registry and the same PartCard frame. There
 * is no second path, no per-role special case that re-renders parts its own
 * way — that duplication is what the legacy tree carried and what dies with it.
 * The one pre-pass this owns is pairing (above): grouping related parts
 * before they reach the registry, never re-rendering a kind a different way.
 */
export function Transcript({ messages }: TranscriptProps) {
  return (
    // The scroller is full-width so its scrollbar rides the pane edge; the
    // 860px reading column is centred inside it. Scrolling the column itself
    // would inset the scrollbar into the text.
    <div className="transcript">
      <div className="transcript__column">
          {messages.map((message) => {
          const parts = (message.parts ?? []) as unknown as WirePart[];
          // A message with no parts has nothing to say; an empty frame would be
          // visual noise implying content that does not exist.
          if (parts.length === 0) return null;

          return (
            <article
              key={message.id}
              className="transcript__message"
              data-role={message.role}
              aria-label={`${message.role} message`}
            >
              {groupParts(parts, message.id).map((group) => (
                <RenderedGroup key={group.key} group={group} />
              ))}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function RenderedGroup({ group }: { group: PartGroup }) {
  if (group.kind === 'tool') {
    return (
      <PartCard kind="tool" gutter={<WrenchGlyph />}>
        <ToolPart call={group.call} result={group.result} />
      </PartCard>
    );
  }
  if (group.kind === 'artifacts') {
    return (
      <PartCard kind="artifacts">
        <ArtifactGrid parts={group.parts} />
      </PartCard>
    );
  }
  return <RenderedPart part={group.part} />;
}

function RenderedPart({ part }: { part: WirePart }) {
  const renderer = PART_RENDERERS[part.type];

  if (!renderer) {
    // NO SILENT FALLBACK. A kind this build cannot render is named on the
    // surface, so a wire change is visible instead of quietly erasing content.
    return (
      <PartCard kind="unrenderable" gutter={<span aria-hidden="true">?</span>}>
        <p className="part-unrenderable" data-testid="part-unrenderable">
          <span className="part-unrenderable__kind">{part.type}</span>
          <span className="part-unrenderable__note">
            this build has no renderer for this part kind
          </span>
        </p>
      </PartCard>
    );
  }

  return (
    <PartCard kind={part.type} {...(renderer.gutter ? { gutter: renderer.gutter } : {})}>
      {renderer.render(part)}
    </PartCard>
  );
}
