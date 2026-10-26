import { defaultRemarkPlugins } from 'streamdown';
import { useContext } from 'react';
import { ScopedDocumentNavigation, remarkBundleFiles } from './scoped-document-navigation';
import { MessageResponse, type MessageResponseProps } from '@/components/ai-elements/message';
import { remarkArtifactImages } from '@/lib/remark-artifact-images';
import { remarkContentReferences } from '@/lib/markdown-content-reference';
import { ArtifactMarkdownImage } from './artifact-markdown-image';
import { MarkdownContentLink } from './markdown-content-link';
import { MarkdownSourceListItem, MarkdownSourceParagraph } from './markdown-source-group';

/** Share registered source navigation across conversation and document Markdown. */
export function ContentMarkdown({ components, remarkPlugins, ...props }: MessageResponseProps) {
  const bundle = useContext(ScopedDocumentNavigation);
  return (
    <MessageResponse
      {...props}
      components={{
        img: ArtifactMarkdownImage,
        a: MarkdownContentLink,
        p: MarkdownSourceParagraph,
        li: MarkdownSourceListItem,
        ...components,
      }}
      remarkPlugins={[
        ...(remarkPlugins ?? Object.values(defaultRemarkPlugins)),
        ...(bundle ? [remarkBundleFiles(bundle.current, bundle.files)] : []),
        remarkArtifactImages,
        remarkContentReferences,
      ]}
    />
  );
}
