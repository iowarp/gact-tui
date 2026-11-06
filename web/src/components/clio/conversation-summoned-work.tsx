import { BookOpenIcon, BotIcon, MessageSquareQuoteIcon, WrenchIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Summons {
  subagents: string[];
  servers: string[];
  failed: { role: string; error: string }[];
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

/** The public summons, loaded skill and MCP prompt a person's message carries. */
function summonedWork(metadata: Record<string, unknown> | undefined): {
  summons?: Summons;
  loadedSkill?: string;
  prompt?: McpPrompt;
} {
  const summons = record(metadata?.summons);
  const prompt = record(metadata?.mcp_prompt);
  return {
    summons: summons
      ? {
          subagents: strings(summons.subagents),
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

/**
 * Under a person's message: what they summoned and what their command loaded.
 * Each summoned subagent is a child the person started; its work and report
 * appear like any child's.
 */
export function ConversationSummonedWork({ metadata }: { metadata?: Record<string, unknown> }) {
  const { summons, loadedSkill, prompt } = summonedWork(metadata);
  const failed = new Set(summons?.failed.map((row) => row.role));
  const started = summons?.subagents.filter((role) => !failed.has(role)) ?? [];
  if (
    !started.length &&
    !summons?.servers.length &&
    !summons?.failed.length &&
    !loadedSkill &&
    !prompt
  )
    return null;
  return (
    <div className="mt-2 grid min-w-0 gap-1" data-slot="summoned-work">
      {started.map((role) => (
        <Row icon={<BotIcon aria-hidden="true" className="size-3.5 shrink-0" />} key={role}>
          You started {role} on this message
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
