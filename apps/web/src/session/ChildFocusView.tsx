/**
 * The prototype's CENTER child view (proto-walk 04c/05b): a focused child
 * agent's own transcript for maximum reading + steering — `▸ prompt from
 * <parent>` folded at the top (the child's first user message IS the
 * delegation brief), then the child's transcript in the shared grammar, then
 * a status footer. The composer beneath it (owned by SessionView) targets
 * this child while focused.
 */
import { useState } from 'react';
import type { Message } from '@clio/core';
import { Transcript } from '../transcript/Transcript';
import './childfocus.css';

export interface ChildFocusViewProps {
  agent: string;
  parentLabel: string;
  messages: Message[];
  status: string;
  onOpenChild?: ((handleId: string, agent: string, opts: { peek: boolean }) => void) | undefined;
}

function briefText(first: Message | undefined): string {
  if (!first || first.role !== 'user') return '';
  const parts = (first.parts ?? []) as { type?: string; text?: string }[];
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('\n');
}

export function ChildFocusView({ agent, parentLabel, messages, status, onOpenChild }: ChildFocusViewProps) {
  const [briefOpen, setBriefOpen] = useState(false);
  const first = messages[0];
  const brief = briefText(first);
  const rest = brief ? messages.slice(1) : messages;
  const running = status === 'running';

  return (
    <div className="childfocus" data-testid="child-focus-view">
      {brief ? (
        <div className="childfocus__brief">
          <button
            type="button"
            className="childfocus__brieftoggle"
            onClick={() => setBriefOpen((v) => !v)}
            aria-expanded={briefOpen}
          >
            {briefOpen ? '▾' : '▸'} prompt from {parentLabel}
          </button>
          {briefOpen ? <pre className="childfocus__briefbody">{brief}</pre> : null}
        </div>
      ) : null}
      <Transcript messages={rest} {...(onOpenChild ? { onOpenChild } : {})} />
      <p className="childfocus__status" data-state={running ? 'running' : status}>
        {running ? `● ${agent} running` : status ? `${agent} · ${status}` : agent}
      </p>
    </div>
  );
}
