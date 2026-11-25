import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { plural, t } from '@lingui/core/macro';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** A short list of names: "relay_describe, relay_packages_read +5". */
export function namesSummary(names: readonly string[], shown = 2): string {
  const head = names.slice(0, shown).join(', ');
  return names.length > shown ? `${head} +${names.length - shown}` : head;
}

interface LoadedTool {
  name: string;
  description?: string;
}

/** The first sentence of a wrapped description, as one line. */
function firstSentence(lines: readonly string[]): string | undefined {
  const joined = lines.join(' ').replace(/\s+/gu, ' ').trim();
  if (!joined) return undefined;
  const end = joined.search(/[.!?](?:\s|$)/u);
  return end >= 0 ? joined.slice(0, end + 1) : joined;
}

/**
 * The producer's text reads `## relay_describe  (relay)` then the description, then
 * `Arguments (JSON schema): …`. A truncated output keeps that text JSON-escaped in its
 * preview. Only the names and descriptions are kept.
 */
function toolsFromText(value: string): LoadedTool[] {
  const source = value.includes('\n') ? value : value.replace(/\\n/gu, '\n').replace(/\\"/gu, '"');
  return source
    .split(/^## /mu)
    .slice(1)
    .flatMap((section) => {
      const [heading = '', ...rest] = section.split('\n');
      const name = heading.replace(/\s+\(.*$/u, '').trim();
      if (!/^[\w.:-]+$/u.test(name)) return [];
      const end = rest.findIndex((line) => /^Arguments\b/u.test(line));
      return [{ name, description: firstSentence(end >= 0 ? rest.slice(0, end) : rest) }];
    });
}

/** The producer's own `tool-N` blocks: label "relay_describe (relay)", text signature + description. */
function toolsFromBlocks(blocks: readonly ToolPresentationBlock[]): LoadedTool[] {
  return blocks.flatMap((block) => {
    if (!/^tool-\d+$/u.test(block.id)) return [];
    const name = block.label?.replace(/\s+\(.*$/u, '').trim();
    if (!name || !/^[\w.:-]+$/u.test(name)) return [];
    const lines = (typeof block.text === 'string' ? block.text : '').split('\n').slice(1);
    const end = lines.findIndex((line) => /^Arguments\b/u.test(line));
    return [{ name, description: firstSentence(end >= 0 ? lines.slice(0, end) : lines) }];
  });
}

/**
 * `search_tools` reads as "Load tools  relay_describe, relay_packages_read +5": the tools it
 * loaded, by name. The expansion lists each name with what it does. The search query, the
 * servers' instructions and the signatures (with CLIO's own `_clio…` arguments) stay in
 * Technical details.
 */
export function withToolSearchPresentation(tool: ToolInvocation): ToolInvocation {
  if (tool.name !== 'search_tools') return tool;
  const outer = record(tool.input);
  const input = record(outer?.kwargs) ?? outer;
  const output = record(tool.output);
  const result =
    record(output?.structuredContent) ??
    record(output?.structured_content) ??
    record(output?.result) ??
    output;
  const query = text(input?.query) ?? text(result?.query) ?? '';
  const structured: LoadedTool[] = (Array.isArray(result?.tools) ? result.tools : [])
    .map(record)
    .flatMap((entry) => {
      const name = entry && text(entry.name);
      return name
        ? [{ name, description: firstSentence((text(entry?.description) ?? '').split('\n')) }]
        : [];
    });
  const textual = [tool.output, output?.result, output?.text, output?.preview].find(
    (value): value is string => typeof value === 'string' && value.includes('## '),
  );
  const loaded: LoadedTool[] = structured.length
    ? structured
    : toolsFromBlocks(tool.presentation?.blocks ?? []).length
      ? toolsFromBlocks(tool.presentation?.blocks ?? [])
      : textual
        ? toolsFromText(textual)
        : [];
  const requested = query.startsWith('select:')
    ? query
        .slice('select:'.length)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    : [];
  const names = loaded.length ? loaded.map((entry) => entry.name) : requested;
  const failed = tool.state === 'failed' || tool.state === 'cancelled';
  const subject: ToolPresentationBlock | undefined = names.length
    ? { id: 'loaded-tools', type: 'text', label: namesSummary(names), text: names.join(', ') }
    : query && !requested.length
      ? { id: 'loaded-tools', type: 'text', label: query }
      : undefined;
  const missing = (Array.isArray(result?.missing) ? result.missing : []).filter(
    (name): name is string => typeof name === 'string' && Boolean(name.trim()),
  );
  // Names alone still make the list, so the expansion never falls back to the raw output.
  const list = (loaded.length ? loaded : names.map((name): LoadedTool => ({ name })))
    .map(({ name, description }) => (description ? `**${name}**  \n${description}` : `**${name}**`))
    .join('\n\n');
  const errors = (tool.presentation?.blocks ?? []).filter((block) => block.severity === 'error');
  const blocks: ToolPresentationBlock[] = [
    ...(subject ? [subject] : []),
    ...(list ? [{ id: 'loaded-tools-list', type: 'markdown' as const, text: list }] : []),
    ...(missing.length
      ? [
          {
            id: 'missing-tools',
            type: 'text' as const,
            label: t`Not found`,
            text: missing.join(', '),
            severity: 'warning' as const,
          },
        ]
      : []),
    ...errors,
  ];
  return {
    ...tool,
    presentation: {
      ...(tool.presentation ?? { blocks: [] }),
      action: names.length === 1 ? t`Load tool` : t`Load tools`,
      subject: subject?.id,
      summary:
        loaded.length && !failed
          ? plural(loaded.length, { one: '# tool loaded', other: '# tools loaded' })
          : (tool.presentation?.summary ?? ''),
      blocks,
    },
  };
}
