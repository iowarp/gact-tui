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
  const loaded = (Array.isArray(result?.tools) ? result.tools : [])
    .map(record)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && text(entry.name)));
  const requested = query.startsWith('select:')
    ? query
        .slice('select:'.length)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    : [];
  const names = loaded.length ? loaded.map((entry) => text(entry.name)!) : requested;
  const failed = tool.state === 'failed' || tool.state === 'cancelled';
  const subject: ToolPresentationBlock | undefined = names.length
    ? { id: 'loaded-tools', type: 'text', label: namesSummary(names), text: names.join(', ') }
    : query && !requested.length
      ? { id: 'loaded-tools', type: 'text', label: query }
      : undefined;
  const missing = (Array.isArray(result?.missing) ? result.missing : []).filter(
    (name): name is string => typeof name === 'string' && Boolean(name.trim()),
  );
  const list = loaded
    .map((entry) => {
      const description = text(entry.description)?.split('\n')[0];
      return description ? `**${text(entry.name)}**  \n${description}` : `**${text(entry.name)}**`;
    })
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
