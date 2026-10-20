import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Clarify older recorded skill reads without looking up or rereading today's skill. */
export function withSkillPresentation(tool: ToolInvocation): ToolInvocation {
  const presentation = tool.presentation;
  if (
    tool.name !== 'load_skill' ||
    tool.state === 'failed' ||
    tool.state === 'cancelled' ||
    !presentation?.subject ||
    ['skill-purpose', 'skill-reference'].includes(presentation.subject)
  )
    return tool;
  const outer = record(tool.input);
  const input = record(outer?.kwargs) ?? outer;
  const output = record(tool.output);
  const result =
    record(output?.structuredContent) ??
    record(output?.structured_content) ??
    record(output?.result) ??
    output;
  const selection =
    input?.file || (Array.isArray(input?.files) && input.files.length) ? input : result;
  const requested = [selection?.file, ...(Array.isArray(selection?.files) ? selection.files : [])];
  const files = [
    ...new Set(
      requested
        .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        .map((item) => item.trim()),
    ),
  ];
  const original = presentation.blocks.find((block) => block.id === presentation.subject);
  const skillId = String(
    input?.skill_id ?? result?.skill_id ?? original?.text ?? original?.label ?? '',
  );
  const recordedContent =
    presentation.blocks.find(
      (block) => block.id !== presentation.subject && block.type === 'markdown',
    )?.text ?? '';
  const content = recordedContent
    .replace(/^# Skill: [^\r\n]+\r?\n/u, '')
    .replace(/^Skill directory(?: \(use as SKILL_ROOT\))?:[^\r\n]*\r?\n/u, '');
  const carrierDirectory = recordedContent.match(
    /^(?:# Skill: [^\r\n]+\r?\n)?Skill directory(?: \(use as SKILL_ROOT\))?:\s*([^\r\n]+)/u,
  )?.[1];
  const description = typeof result?.skill_description === 'string' ? result.skill_description : '';
  const mainPath = typeof result?.path === 'string' ? result.path : '';
  const directory =
    result?.skill_directory ||
    carrierDirectory ||
    (/^(?:[a-z]:[\\/]|\/)/iu.test(mainPath) ? mainPath.replace(/[\\/][^\\/]+$/u, '') : '');
  const heading = content
    .split('\n')
    .find((line) => /^#\s+(?!Skill:)/u.test(line))
    ?.replace(/^#\s+/u, '');
  const title = String(result?.skill_title || result?.skill_description || heading || skillId);
  const subject: ToolPresentationBlock = {
    id: files.length ? 'skill-reference' : 'skill-purpose',
    type: 'text',
    text: files.length === 1 ? files[0] : files.length ? `${files.length} reference files` : title,
  };
  const paths = record(result?.file_paths);
  const fileBlocks: ToolPresentationBlock[] = (files.length ? files : ['SKILL.md']).map(
    (file, index) => {
      const path = files.length ? paths?.[file] : result?.path;
      return typeof path === 'string' && /^(?:[a-z]:[\\/]|\/)/iu.test(path)
        ? { id: `skill-file-${index}`, type: 'link', target: 'file', uri: path, label: file }
        : { id: `skill-file-${index}`, type: 'text', label: 'File read', text: file };
    },
  );
  return {
    ...tool,
    presentation: {
      ...presentation,
      action: files.length
        ? files.length === 1
          ? 'Read skill reference'
          : 'Read skill references'
        : 'Load skill',
      subject: subject.id,
      summary: files.length ? heading || '' : 'Main procedure',
      blocks: [
        subject,
        ...(description
          ? [
              {
                id: 'skill-description',
                type: 'text' as const,
                label: 'When to use',
                text: description,
              },
            ]
          : []),
        { id: 'skill-identity', type: 'text', label: 'Skill', text: skillId },
        ...(typeof directory === 'string' && directory
          ? [
              {
                id: 'skill-directory',
                type: 'text' as const,
                label: 'Skill directory',
                text: directory,
              },
            ]
          : []),
        ...fileBlocks,
        ...presentation.blocks
          .filter((block) => block.id !== presentation.subject)
          .map((block) =>
            block.type === 'markdown' && block.text === recordedContent
              ? { ...block, text: content }
              : block,
          ),
      ],
    },
  };
}
