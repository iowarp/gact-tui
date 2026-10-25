import { useContext, useMemo } from 'react';
import { WrapTextIcon } from 'lucide-react';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { languageForPath } from '@/lib/code-language';
import { cn } from '@/lib/utils';
import { FileSourceOptions } from './file-viewer-context';
import { useFileViewerActions } from './file-viewer-action-context';

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
  return (
    <CodeBlock
      role="region"
      aria-label={label || `Source of ${name}`}
      code={content}
      language={language}
      showLineNumbers
      className={cn(
        'h-full min-h-0 min-w-0 rounded-none border-0',
        options?.wrap
          ? '[&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere]'
          : '[&_pre]:w-max [&_pre]:min-w-full [&_pre]:whitespace-pre [&_pre]:[overflow-wrap:normal]',
      )}
    />
  );
}
