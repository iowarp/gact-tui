import { FileTextView } from './file-text-view';
export { HtmlPreview } from './html-preview';

/** HTML files use the same file toolbar and source presentation as other readable formats. */
export function HtmlFilePreview({
  name,
  content,
  view,
}: {
  name: string;
  content: string;
  view?: 'preview' | 'source';
}) {
  return <FileTextView name={name} content={content} format="html" view={view} />;
}
