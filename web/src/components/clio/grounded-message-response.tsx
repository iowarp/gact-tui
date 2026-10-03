import type { MessageResponseProps } from '@/components/ai-elements/message';
import { MessageResponse } from '@/components/ai-elements/message';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';
import { groundedMessageSegments } from '@/lib/grounded-message-sources';
import { cn } from '@/lib/utils';
import { defaultRemarkPlugins } from 'streamdown';
import { ArtifactMarkdownImage } from './artifact-markdown-image';
import { remarkArtifactImages } from '@/lib/remark-artifact-images';

const artifactRemarkPlugins = [...Object.values(defaultRemarkPlugins), remarkArtifactImages];
const artifactComponents = { img: ArtifactMarkdownImage };

/** Render explicit source entries as AI Elements source objects in transcript order. */
export function GroundedMessageResponse({ children, className, ...options }: MessageResponseProps) {
  const props = {
    ...options,
    components: { ...artifactComponents, ...options.components },
    remarkPlugins: options.remarkPlugins ?? artifactRemarkPlugins,
  };
  if (typeof children !== 'string') {
    return (
      <MessageResponse className={className} {...props}>
        {children}
      </MessageResponse>
    );
  }

  const segments = groundedMessageSegments(children);
  if (!segments.some((segment) => segment.kind === 'sources')) {
    return (
      <MessageResponse className={className} {...props}>
        {children}
      </MessageResponse>
    );
  }

  return (
    <div className={cn('flex size-full flex-col gap-3', className)}>
      {segments.map((segment, index) =>
        segment.kind === 'markdown' ? (
          <MessageResponse key={`markdown:${index}`} {...props}>
            {segment.text}
          </MessageResponse>
        ) : (
          <Sources className="mb-0" defaultOpen key={`sources:${index}`}>
            <SourcesTrigger count={segment.sources.length} />
            <SourcesContent>
              {segment.sources.map((source) => (
                <Source
                  description={source.description}
                  href={source.href}
                  key={source.href}
                  title={source.title}
                />
              ))}
            </SourcesContent>
          </Sources>
        ),
      )}
    </div>
  );
}
