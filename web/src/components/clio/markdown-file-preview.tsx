import { FileTextView } from './file-text-view';

/** Saved Markdown uses the shared content modes, copy action and scroll layout. */
export function MarkdownFilePreview({ name, content }: { name: string; content: string }) {
  return <FileTextView name={name} content={content} format="markdown" />;
}
