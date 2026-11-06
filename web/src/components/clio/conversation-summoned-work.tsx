import {
  BookOpenIcon,
  BotIcon,
  CircleSlashIcon,
  MessageSquareQuoteIcon,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Summons {
  subagents: string[];
  workflows: string[];
  flows: string[];
  servers: string[];
  failed: { role: string; error: string }[];
}

interface Outcome {
  started: { kind: string; target: string }[];
  notStarted: { kind: string; target: string; reason: string }[];
}

interface McpPrompt {
  server: string;
  prompt: string;
  arguments: Record<string, string>;
  text: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function targets(value: unknown): { kind: string; target: string; reason: string }[] {
  return (Array.isArray(value) ? value : []).flatMap((row) => {
    const item = record(row);
    return item
      ? [
          {
            kind: String(item.kind ?? ''),
            target: String(item.target ?? ''),
            reason: String(item.reason ?? ''),
          },
        ]
      : [];
  });
}

/**
 * The public summons, loaded skill and MCP prompt a person's message carries, and
 * on the turn's answer which of the summoned targets its calls started.
 */
function summonedWork(metadata: Record<string, unknown> | undefined): {
  summons?: Summons;
  outcome?: Outcome;
  loadedSkill?: string;
  prompt?: McpPrompt;
} {
  const summons = record(metadata?.summons);
  const outcome = record(metadata?.summons_outcome);
  const prompt = record(metadata?.mcp_prompt);
  return {
    outcome: outcome
      ? { started: targets(outcome.started), notStarted: targets(outcome.not_started) }
      : undefined,
    summons: summons
      ? {
          subagents: strings(summons.subagents),
          workflows: strings(summons.workflows),
          flows: strings(summons.flows),
          servers: strings(summons.servers),
          failed: (Array.isArray(summons.failed) ? summons.failed : []).flatMap((row) => {
            const failure = record(row);
            return failure
              ? [{ role: String(failure.role ?? ''), error: String(failure.error ?? '') }]
              : [];
          }),
        }
      : undefined,
    loadedSkill: typeof metadata?.loaded_skill === 'string' ? metadata.loaded_skill : undefined,
    prompt: prompt
      ? {
          server: String(prompt.server ?? ''),
          prompt: String(prompt.prompt ?? ''),
          arguments: Object.fromEntries(
            Object.entries(record(prompt.arguments) ?? {}).map(([key, value]) => [
              key,
              String(value),
            ]),
          ),
          text: String(prompt.text ?? ''),
        }
      : undefined,
  };
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

function PromptRow({ prompt }: { prompt: McpPrompt }) {
  const [open, setOpen] = useState(false);
  const args = Object.entries(prompt.arguments)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <MessageSquareQuoteIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">
          Prompt {prompt.prompt} from {prompt.server}
          {args ? ` (${args})` : ''}
        </span>
        <span className="sr-only">
          {open ? 'Hide the fetched prompt' : 'Show the fetched prompt'}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-2 text-xs">
          {prompt.text || 'The prompt returned no text.'}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A summoned target in words: `explore`, `the workflow draft-review`. */
function named(kind: string, target: string, start = false): string {
  if (kind !== 'workflow' && kind !== 'flow') return target;
  return `${start ? 'The' : 'the'} ${kind} ${target}`;
}

/** Why a summoned target did not start, when there is more to say than that it was not. */
function notStartedReason(reason: string): string {
  return !reason || reason === 'not_called' ? '' : `: ${reason}`;
}

function kindIcon(kind: string) {
  return kind === 'workflow' || kind === 'flow' ? (
    <WorkflowIcon aria-hidden="true" className="size-3.5 shrink-0" />
  ) : (
    <BotIcon aria-hidden="true" className="size-3.5 shrink-0" />
  );
}

/**
 * Under a person's message: what they asked for and what their command loaded.
 * Under the turn's answer: which of the summoned subagents, workflows and flows
 * its calls started (each then appears like any child), and which they did not.
 */
export function ConversationSummonedWork({ metadata }: { metadata?: Record<string, unknown> }) {
  const { summons, outcome, loadedSkill, prompt } = summonedWork(metadata);
  const asked = [
    ...(summons?.subagents ?? []).map((target) => ({ kind: 'subagent', target })),
    ...(summons?.workflows ?? []).map((target) => ({ kind: 'workflow', target })),
    ...(summons?.flows ?? []).map((target) => ({ kind: 'flow', target })),
  ];
  if (
    !asked.length &&
    !summons?.servers.length &&
    !summons?.failed.length &&
    !outcome?.started.length &&
    !outcome?.notStarted.length &&
    !loadedSkill &&
    !prompt
  )
    return null;
  return (
    <div className="mt-2 grid min-w-0 gap-1" data-slot="summoned-work">
      {asked.map((row) => (
        <Row icon={kindIcon(row.kind)} key={`asked:${row.kind}:${row.target}`}>
          You asked for {named(row.kind, row.target)} on this message
        </Row>
      ))}
      {outcome?.started.map((row) => (
        <Row icon={kindIcon(row.kind)} key={`started:${row.kind}:${row.target}`}>
          Started {named(row.kind, row.target)} as you asked
        </Row>
      ))}
      {outcome?.notStarted.map((row) => (
        <Row
          icon={<CircleSlashIcon aria-hidden="true" className="size-3.5 shrink-0" />}
          key={`not-started:${row.kind}:${row.target}`}
        >
          {named(row.kind, row.target, true)} was not started{notStartedReason(row.reason)}
        </Row>
      ))}
      {summons?.failed.map((row) => (
        <Row
          icon={<BotIcon aria-hidden="true" className="size-3.5 shrink-0" />}
          key={`failed:${row.role}`}
        >
          {row.role} did not start: {row.error || 'no reason was given'}
        </Row>
      ))}
      {summons?.servers.map((server) => (
        <Row icon={<WrenchIcon aria-hidden="true" className="size-3.5 shrink-0" />} key={server}>
          You pointed this message at the {server} tools
        </Row>
      ))}
      {loadedSkill ? (
        <Row icon={<BookOpenIcon aria-hidden="true" className="size-3.5 shrink-0" />}>
          Loaded skill {loadedSkill}
        </Row>
      ) : null}
      {prompt ? <PromptRow prompt={prompt} /> : null}
    </div>
  );
}
