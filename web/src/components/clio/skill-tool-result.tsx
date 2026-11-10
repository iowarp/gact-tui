import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { BoundedResult } from './bounded-result';
import { BlockBody, PagedBlock } from './tool-result-primitives';
import { PresentationLink } from './presentation-link';
import { ResultDialogContent } from './result-dialog-content';
import { skillFileBlock, skillFileSection } from './skill-file-content';

/**
 * A skill's files live with the installed skill, outside every workspace, so
 * the workspace file reader refuses them. Open the exact text this call
 * loaded instead, read-only, with the source path as supplemental detail.
 */
function SkillFileLink({
  file,
  index,
  count,
  body,
}: {
  file: ToolPresentationBlock;
  index: number;
  count: number;
  body: ToolPresentationBlock | undefined;
}) {
  const name = file.label || file.text || '';
  const path = file.uri ?? '';
  if (!body || !name)
    return (
      <p className="break-all" title={path || undefined}>
        {name}
      </p>
    );
  const render = (text: string, complete: boolean) => {
    const section = skillFileSection(text, name, index, count);
    if (section === undefined)
      return (
        <p className="text-muted-foreground">
          {complete
            ? 'This call did not retain a separate copy of this file.'
            : 'Load the complete content to read this file.'}
        </p>
      );
    return <BlockBody block={skillFileBlock(name, section)} text={section} full />;
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="link"
          className="block h-auto whitespace-normal p-0 text-left text-sm break-words"
          title={path || undefined}
        >
          {name}
        </Button>
      </DialogTrigger>
      <ResultDialogContent title={name} description={path || undefined}>
        {body.content_ref ? (
          <PagedBlock
            block={body}
            lines={0}
            full
            renderBlock={(_block, text, complete) => render(text, complete)}
          />
        ) : (
          render(body.text ?? '', true)
        )}
      </ResultDialogContent>
    </Dialog>
  );
}

/** Keep the skill's discovery metadata with its instructions in previews and full viewers. */
export function SkillToolResult({
  tool,
  blocks,
  lines,
}: {
  tool: ToolInvocation;
  blocks: ToolPresentationBlock[];
  lines: number;
}) {
  const body = blocks.find((block) => block.type === 'markdown')!;
  const subject = tool.presentation?.blocks.find(
    (block) => block.id === tool.presentation?.subject,
  );
  const title =
    (tool.presentation?.subject === 'skill-reference'
      ? tool.presentation?.summary
      : subject?.text) || 'Skill instructions';
  const directory = blocks.find((block) => block.id === 'skill-directory');
  const files = blocks.filter((block) => block.id.startsWith('skill-file-'));
  const fileLink = (file: ToolPresentationBlock) => (
    <SkillFileLink
      key={file.id}
      file={file}
      index={files.indexOf(file)}
      count={files.length}
      body={body}
    />
  );
  const renderBlock = (block: ToolPresentationBlock, text: string) => {
    if (directory && block.id.startsWith('skill-file-')) return null;
    if (block.id === 'skill-directory')
      return (
        <details className="px-2 py-1 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Source</summary>
          <p className="mt-1 break-all">
            <span className="text-muted-foreground">Skill directory: </span>
            {text}
          </p>
          {files.map((file) =>
            file.type === 'link' ? (
              fileLink(file)
            ) : (
              <p key={file.id}>
                {file.label ? `${file.label}: ` : ''}
                {file.text}
              </p>
            ),
          )}
        </details>
      );
    if (block.type === 'link' && block.id.startsWith('skill-file-'))
      return <div className="px-2 py-1 text-sm">{fileLink(block)}</div>;
    if (block.type === 'link') return <PresentationLink block={block} />;
    if (block.type === 'text' && block.label)
      return (
        <div className="px-2 py-1 text-sm">
          <span className="font-medium">
            {block.id === 'skill-description' ? 'When to use' : block.label}:{' '}
          </span>
          {text}
        </div>
      );
    return <BlockBody block={block} text={text} />;
  };
  return (
    <div className="ml-7 min-w-0" data-slot="tool-human-result">
      <div
        className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
        data-slot="tool-result-panel"
        data-skill-metadata
      >
        {blocks.some((block) => block.content_ref) ? (
          <PagedBlock
            block={{ ...body, label: title }}
            groupedBlocks={blocks}
            lines={lines}
            renderBlock={renderBlock}
          />
        ) : (
          <BoundedResult lines={lines} title={title}>
            {blocks.map((block) => (
              <div key={block.id}>{renderBlock(block, block.text ?? '')}</div>
            ))}
          </BoundedResult>
        )}
      </div>
    </div>
  );
}
