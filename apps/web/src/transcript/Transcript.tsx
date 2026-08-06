import type { ReactNode, Ref } from 'react';
import type { Message } from '@clio/core';
import { PartCard } from '../kit';
import '../session/returncard.css';
import { ArtifactGrid } from './parts/ArtifactChip';
import { MergedHandoff, type ChildPreview } from './parts/HandoffPart';
import { ToolPart } from './parts/ToolPart';
import { PART_RENDERERS, WrenchGlyph, type WirePart } from './registry';
import './transcript.css';

export interface TranscriptProps {
  messages: Message[];
  /** Opens a delegation's child (center focus; peek=true → right panel). */
  onOpenChild?: (handleId: string, agent: string, opts: { peek: boolean }) => void;
  /** Opens an artifact in the right detail panel (prototype artGo). */
  onOpenArtifact?: (artifactId: string, name: string) => void;
  /** Live child-session previews for RUNNING delegations, keyed by handle_id
   *  (SessionView's `childPreviews`). A handoff with no entry here just shows
   *  its plain running footer — never a fabricated preview. */
  childPreviews?: Record<string, ChildPreview>;
  /** The `.transcript` scroller's own DOM node (`overflow-y: auto` lives
   *  here — see transcript.css). SessionView reads/writes `scrollTop`
   *  through this for two things: the progressive-load backfill's
   *  scroll-anchor compensation (prepending an older page must not move
   *  what's currently on screen) and the center-nav back/forward scroll
   *  restore. A plain optional prop rather than `forwardRef` — Transcript
   *  is exercised directly by several existing tests/callers that never
   *  pass a ref, so this keeps every one of them unaffected. */
  scrollContainerRef?: Ref<HTMLDivElement>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

/**
 * The wire's stamp on a child session's returning assistant message (SPEC
 * interim, owner 2026-08-05): `metadata.delegation_return` on
 * GET /v1/sessions/{child_sid}/messages, `{ parent_session_id, task_id,
 * parent_agent }`. This IS the "this message is my response to my parent"
 * signal — the client never infers it from position (e.g. "last message"),
 * only ever reads this field. Older sessions written before the stamp landed
 * simply lack it, and render exactly as any other assistant message.
 */
interface DelegationReturn {
  parent_session_id?: string;
  task_id?: string;
  parent_agent?: string;
}

function delegationReturnOf(message: Message): DelegationReturn | undefined {
  const meta = message.metadata;
  if (!meta || typeof meta !== 'object') return undefined;
  const raw = (meta as Record<string, unknown>)['delegation_return'];
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as DelegationReturn) : undefined;
}

/**
 * A part IS the child's answer to its parent, distinguishable from narration
 * on the wire (live child sess_c025378f8e7f): the DSPy signature field that
 * produced it rides `metadata.signature_field_name` — `"next_thought"` for
 * streamed narration (`stream_source: "live"`), `"answer"` for the
 * extract-produced return (`stream_source: "batch"`). Only the `"answer"`
 * part is the response; narration is not, even on a stamped message.
 */
function isAnswerPart(part: WirePart): boolean {
  const meta = part['metadata'];
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>)['signature_field_name'] === 'answer';
}

/**
 * The return-to-parent card (owner, 2026-08-05: "the last message on the
 * sub-agents is the response of the sub agent to the parent, and it should
 * be marked as such"; refined 2026-08-05 with wire evidence: the card holds
 * ONLY the answer-field part, narration renders normally outside it) — the
 * prototype's teal RETURN -> MAIN card, sized to just the response. A
 * message-level wrapper, not a part renderer: the answer part's already-
 * rendered output sits inside ONE teal-accented container under a "returned
 * to <parent>" eyebrow, same body rendering (markdown, tool rows, …) as any
 * other part — only the frame around it changes.
 */
function ReturnCard({ parentAgent, children }: { parentAgent: string; children: ReactNode }) {
  return (
    <div className="returncard" data-testid="return-card">
      <div className="returncard__head">
        <span className="returncard__dot" aria-hidden="true" />
        <span className="returncard__label">returned to {parentAgent}</span>
      </div>
      <div className="returncard__body">{children}</div>
    </div>
  );
}

type PartGroup =
  | { key: string; kind: 'part'; part: WirePart }
  | { key: string; kind: 'tool'; call: WirePart; result?: WirePart }
  | { key: string; kind: 'artifacts'; parts: WirePart[] }
  | { key: string; kind: 'handoff'; terminal: WirePart };

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

    if (part.type === 'expert_handoff') {
      // ONE delegation = ONE part on the clean wire (the terminal updates the
      // started part in place server-side; metadata carries brief AND output).
      // No client-side pairing — the UI renders exactly what arrives.
      groups.push({ key, kind: 'handoff', terminal: part });
      continue;
    }

    groups.push({ key, kind: 'part', part });
  }

  return groups;
}

interface TranscriptHandlers {
  onOpenChild?: TranscriptProps['onOpenChild'];
  onOpenArtifact?: TranscriptProps['onOpenArtifact'];
  childPreviews?: TranscriptProps['childPreviews'];
}

/** Groups + renders one part list under one key namespace — the shared tail
 *  of both the plain path and the split return-card path below. */
function renderPartGroups(parts: WirePart[], keyPrefix: string, handlers: TranscriptHandlers): ReactNode[] {
  return groupParts(parts, keyPrefix).map((group) => (
    <RenderedGroup
      key={group.key}
      group={group}
      {...(handlers.onOpenChild ? { onOpenChild: handlers.onOpenChild } : {})}
      {...(handlers.onOpenArtifact ? { onOpenArtifact: handlers.onOpenArtifact } : {})}
      {...(handlers.childPreviews ? { childPreviews: handlers.childPreviews } : {})}
    />
  ));
}

/**
 * The transcript — ONE pipeline from wire parts to rendered parts.
 *
 * Every part goes through the same registry and the same PartCard frame. There
 * is no second path, no per-role special case that re-renders parts its own
 * way — that duplication is what the legacy tree carried and what dies with it.
 * The one pre-pass this owns is pairing (above): grouping related parts
 * before they reach the registry, never re-rendering a kind a different way.
 *
 * A stamped message (`delegationReturnOf`) is a second, narrower pre-pass:
 * its answer-field part(s) (`isAnswerPart`) split out into the return card,
 * everything else — narration, tool rows, artifacts — renders normally
 * outside it, in wire order. A stamped message with no answer-field part
 * (a batch-only shape) falls back to wrapping the whole message, so the
 * stamp is never silently dropped.
 */
export function Transcript({
  messages,
  onOpenChild,
  onOpenArtifact,
  childPreviews,
  scrollContainerRef,
}: TranscriptProps) {
  const handlers: TranscriptHandlers = { onOpenChild, onOpenArtifact, childPreviews };
  return (
    // The scroller is full-width so its scrollbar rides the pane edge; the
    // 860px reading column is centred inside it. Scrolling the column itself
    // would inset the scrollbar into the text.
    <div className="transcript" ref={scrollContainerRef}>
      <div className="transcript__column">
          {messages.map((message) => {
          const parts = (message.parts ?? []) as unknown as WirePart[];
          // A message with no parts has nothing to say; an empty frame would be
          // visual noise implying content that does not exist.
          if (parts.length === 0) return null;

          const delegationReturn = delegationReturnOf(message);
          const answerParts = delegationReturn ? parts.filter(isAnswerPart) : [];

          let body: ReactNode;
          if (delegationReturn && answerParts.length > 0) {
            const otherParts = parts.filter((part) => !isAnswerPart(part));
            body = [
              ...(otherParts.length > 0 ? renderPartGroups(otherParts, message.id, handlers) : []),
              <ReturnCard key="return-card" parentAgent={str(delegationReturn.parent_agent)}>
                {renderPartGroups(answerParts, `${message.id}:answer`, handlers)}
              </ReturnCard>,
            ];
          } else if (delegationReturn) {
            // No answer-field part on a stamped message (batch-only shape) —
            // wrap the whole message rather than dropping the stamp.
            body = (
              <ReturnCard parentAgent={str(delegationReturn.parent_agent)}>
                {renderPartGroups(parts, message.id, handlers)}
              </ReturnCard>
            );
          } else {
            body = renderPartGroups(parts, message.id, handlers);
          }

          return (
            <article
              key={message.id}
              className="transcript__message"
              data-role={message.role}
              data-message-id={message.id}
              aria-label={`${message.role} message`}
            >
              {body}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function RenderedGroup({
  group,
  onOpenChild,
  onOpenArtifact,
  childPreviews,
}: {
  group: PartGroup;
  onOpenChild?: TranscriptProps['onOpenChild'];
  onOpenArtifact?: TranscriptProps['onOpenArtifact'];
  childPreviews?: TranscriptProps['childPreviews'];
}) {
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
        <ArtifactGrid parts={group.parts} onOpenArtifact={onOpenArtifact} />
      </PartCard>
    );
  }
  if (group.kind === 'handoff') {
    const handleId = str(group.terminal['handle_id']);
    const preview = handleId ? childPreviews?.[handleId] : undefined;
    return (
      <PartCard kind="expert_handoff" gutter={<WrenchGlyph />}>
        <MergedHandoff
          terminal={group.terminal}
          {...(onOpenChild ? { onOpenChild } : {})}
          {...(preview ? { preview } : {})}
        />
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
