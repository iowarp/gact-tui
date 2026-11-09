import { useContext, useMemo } from 'react';
import { WrapTextIcon } from 'lucide-react';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { languageForPath } from '@/lib/code-language';
import { cn } from '@/lib/utils';
import { FileSourceOptions } from './file-viewer-context';
import { useFileViewerActions } from './file-viewer-action-context';
import { isLargeSource } from '@/lib/source-window';
import { VirtualSourceLines } from './virtual-source-lines';

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
  const options = useContext(FileSourceOptions);
  const actions = useMemo(
    () =>
      options
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
    [options],
  );
  useFileViewerActions(actions);
  const large = useMemo(() => isLargeSource(content), [content]);
  // Highlighting tokenizes and mounts every line; large files list only the lines in view.
  if (large)
    return (
      <VirtualSourceLines
        role="region"
        aria-label={label || `Source of ${name}`}
        className="h-full"
        content={content}
        wrap={options?.wrap ?? false}
      />
    );
  return (
    <CodeBlock
      role="region"
      aria-label={label || `Source of ${name}`}
      code={content}
      language={language}
      showLineNumbers
      className={cn(
        'h-full min-h-0 min-w-0 rounded-none border-0 [&_:is(pre,code)]:text-[11.5px] [&_pre]:leading-[1.65]',
        options?.wrap
          ? '[&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere]'
          : '[&_pre]:w-max [&_pre]:min-w-full [&_pre]:whitespace-pre [&_pre]:[overflow-wrap:normal]',
      )}
    />
  );
}
