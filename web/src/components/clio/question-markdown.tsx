import { literalCommandText } from '@/lib/literal-command-text';
import { ContentMarkdown } from './content-markdown';

/** Render question text with the same links, math and Markdown as responses; commands stay literal. */
export function QuestionMarkdown({ children }: { children: string }) {
  return (
    <ContentMarkdown
      className="min-w-0 break-words text-sm leading-snug [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:max-w-full"
      mode="static"
    >
      {literalCommandText(children)}
    </ContentMarkdown>
  );
}
