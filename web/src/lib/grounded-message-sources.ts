export interface GroundedMessageSource {
  description?: string;
  href: string;
  title: string;
}

export type GroundedMessageSegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'sources'; sources: GroundedMessageSource[] };

const SOURCE_LINE =
  /^\s*(?:[-*+]\s+|\d+[.)]\s+)(?:\*\*)?Source(?:\*\*)?:\s*\[([^\]]+)\]\((https?:\/\/[^\s]+)\)(?:\s*(.*?))?\s*$/u;

function sourceFromLine(line: string): GroundedMessageSource | undefined {
  const match = SOURCE_LINE.exec(line);
  if (!match?.[1] || !match[2]) return undefined;
  const description = match[3]?.trim().replace(/^[—–-]\s*/u, '');
  return {
    title: match[1].trim(),
    href: match[2],
    ...(description ? { description } : {}),
  };
}

/** Extract only explicitly labeled standalone source entries from Markdown. */
export function groundedMessageSegments(text: string): GroundedMessageSegment[] {
  const segments: GroundedMessageSegment[] = [];
  let markdown: string[] = [];
  let sources: GroundedMessageSource[] = [];

  const flushMarkdown = () => {
    const value = markdown.join('\n');
    if (value.trim()) segments.push({ kind: 'markdown', text: value });
    markdown = [];
  };
  const flushSources = () => {
    if (sources.length) segments.push({ kind: 'sources', sources });
    sources = [];
  };

  for (const line of text.split('\n')) {
    const source = sourceFromLine(line);
    if (source) {
      flushMarkdown();
      sources.push(source);
      continue;
    }
    flushSources();
    markdown.push(line);
  }
  flushSources();
  flushMarkdown();
  return segments;
}
