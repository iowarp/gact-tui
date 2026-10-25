import { FileTextView } from './file-text-view';

/** Data is offered only when a JSON file has a meaningful lossless table representation. */
export function ClioJsonResourceView({ content, title }: { content: string; title: string }) {
  return <FileTextView name={title} content={content} format="json" />;
}
