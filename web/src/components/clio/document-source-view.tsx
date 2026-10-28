import { FileSourceView } from './file-source-view';

import type { DocumentSourceProfile } from './document-open-policy';
const formats = {
  markdown: { language: 'markdown', label: 'Raw Markdown' },
  'html-static': { language: 'html', label: 'HTML source' },
  latex: { language: 'latex', label: 'LaTeX source' },
} as const;

/** Show the exact source beneath the document's shared identity and actions. */
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
    <FileSourceView
      name={name}
      label={`${format.label} for ${name}`}
      content={content}
      language={format.language}
    />
  );
}
