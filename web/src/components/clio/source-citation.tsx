import type { ReactElement } from 'react';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation';

/** Keep source identity inspectable while the child link owns destination routing. */
export function SourceCitation({
  children,
  href,
  title,
  detail,
  description,
}: {
  children: ReactElement;
  href: string;
  title: string;
  detail: string;
  description: string;
}) {
  return (
    <InlineCitation className="not-prose align-baseline" data-slot="source-citation">
      <InlineCitationCard openDelay={150}>
        <InlineCitationCardTrigger
          asChild
          sources={[href]}
          className="ml-0 h-auto max-w-full min-w-0 align-baseline whitespace-normal [overflow-wrap:anywhere] no-underline"
        >
          {children}
        </InlineCitationCardTrigger>
        <InlineCitationCardBody className="w-80 max-w-[calc(100vw-2rem)] p-3">
          <InlineCitationSource
            title={title}
            url={detail}
            description={description}
            className="[&_p]:whitespace-normal [&_p]:[overflow-wrap:anywhere]"
          />
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
}
