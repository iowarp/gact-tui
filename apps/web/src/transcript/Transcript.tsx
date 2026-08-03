import type { Message } from '@clio/core';
import { PartCard } from '../kit';
import { PART_RENDERERS, type WirePart } from './registry';
import './transcript.css';

export interface TranscriptProps {
  messages: Message[];
}

/**
 * The transcript — ONE pipeline from wire parts to rendered parts.
 *
 * Every part goes through the same registry and the same PartCard frame. There
 * is no second path, no per-role special case that re-renders parts its own
 * way — that duplication is what the legacy tree carried and what dies with it.
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
              {parts.map((part, index) => (
                <RenderedPart key={`${message.id}:${index}`} part={part} />
              ))}
            </article>
          );
        })}
      </div>
    </div>
  );
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
