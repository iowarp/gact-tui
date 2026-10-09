import { FileCode2Icon } from 'lucide-react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';

import type { DocumentSourceProfile } from './document-open-policy';
const formats = {
  markdown: { language: 'markdown', label: 'Raw Markdown' },
  'html-static': { language: 'html', label: 'HTML source' },
  latex: { language: 'latex', label: 'LaTeX source' },
} as const;

/** Show and copy the original source independently of a rendered display copy. */
export function DocumentSourceView({
  name,
  profile,
  content,
}: {
  name: string;
  profile: DocumentSourceProfile;
  content?: string;
}) {
  if (content === undefined)
    return <p className="p-4 text-sm text-muted-foreground">Loading source…</p>;
  const format = formats[profile];
  return (
    <CodeBlock
      aria-label={`${format.label} for ${name}`}
      className="h-full min-h-0"
      code={content}
      language={format.language}
      role="region"
      showLineNumbers
    >
      <CodeBlockHeader>
        <CodeBlockTitle>
          <FileCode2Icon aria-hidden="true" />
          <CodeBlockFilename>{name}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton aria-label={`Copy raw ${name}`} />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}
