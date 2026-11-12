import { useContext, useMemo } from 'react';
import { WrapTextIcon } from 'lucide-react';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { languageForPath } from '@/lib/code-language';
import { cn } from '@/lib/utils';
import { FileSourceOptions } from './file-viewer-context';
import { useFileViewerActions } from './file-viewer-action-context';
import { isLargeSource } from '@/lib/source-window';
import { VirtualSourceLines } from './virtual-source-lines';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { ViewerToolbarHost } from './viewer-toolbar-context';

const DELIMITED = /\.(?:csv|tsv)$/iu;

/** A delimited file's first line names its columns; the source draws it faint, as the frame spec does. */
const HEADER_ROW_CLASS =
  '[&_code>span:first-child]:text-faint [&_code>span:first-child_span]:text-faint!';

/** Source has logical numbered lines, one scroll owner, and no nested title or actions. */
export function FileSourceView({
  name,
  content,
  language = languageForPath(name),
  label,
}: {
  name: string;
  content: string;
  language?: Parameters<typeof CodeBlock>[0]['language'];
  label?: string;
}) {
  const headerRow = DELIMITED.test(name);
  const options = useContext(FileSourceOptions);
  // In a frame bar, Wrap is a visible Format toggle (frame-bar 05); elsewhere it joins the menu.
  const toolbar = useContext(ViewerToolbarHost);
  const actions = useMemo(
    () =>
      options && !toolbar
        ? [
            {
              kind: 'view' as const,
              label: 'Wrap long lines',
              icon: WrapTextIcon,
              selected: options.wrap,
              onSelect: () => options.setWrap(!options.wrap),
            },
          ]
        : [],
    [options, toolbar],
  );
  useFileViewerActions(actions);
  const large = useMemo(() => isLargeSource(content), [content]);
  // Long lines wrap unless the reader turns it off; a standalone source has no toggle.
  const wrap = options?.wrap ?? true;
  const wrapToggle =
    options && toolbar ? (
      <ViewerToolbarContent>
        <ToolbarAction
          aria-pressed={options.wrap}
          label="Wrap long lines"
          onClick={() => options.setWrap(!options.wrap)}
        >
          <WrapTextIcon aria-hidden="true" />
        </ToolbarAction>
      </ViewerToolbarContent>
    ) : null;
  // Highlighting tokenizes and mounts every line; large files list only the lines in view.
  if (large)
    return (
      <>
        {wrapToggle}
        <VirtualSourceLines
          role="region"
          aria-label={label || `Source of ${name}`}
          className="h-full"
          content={content}
          headerRow={headerRow}
          language={language}
          wrap={wrap}
        />
      </>
    );
  return (
    <>
      {wrapToggle}
      <CodeBlock
        role="region"
        aria-label={label || `Source of ${name}`}
        code={content}
        language={language}
        showLineNumbers
        data-header-row={headerRow ? '' : undefined}
        className={cn(
          // Flush on the page, as the frame spec draws source: no filled panel.
          'h-full min-h-0 min-w-0 rounded-none border-0 bg-transparent [&_pre]:bg-transparent! [&_:is(pre,code)]:text-label [&_:is(pre,code)]:leading-[1.65]',
          wrap
            ? // Wrapped lines hang past the line numbers and the line's own indent, so a
              // number marks only its own line and continuation rows keep the indent. The
              // number and the indent sit outside the inline flow, so a row never breaks
              // before the line's first word.
              '[&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] [&_pre_code>span]:relative [&_pre_code>span]:min-h-[1.65em] [&_pre_code>span]:[padding-left:calc(3rem_+_var(--indent,0ch))] [&_pre_code>span]:before:absolute [&_pre_code>span]:before:left-0 [&_pre_code>span>[data-indent]]:absolute'
            : '[&_pre]:w-max [&_pre]:min-w-full [&_pre]:whitespace-pre [&_pre]:[overflow-wrap:normal]',
          headerRow && HEADER_ROW_CLASS,
        )}
      />
    </>
  );
}
