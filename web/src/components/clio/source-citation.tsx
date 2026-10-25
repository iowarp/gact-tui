import { cloneElement, type ComponentProps, type ReactElement } from 'react';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation';

/** Let the citation and its preview share the same destination and routing. */
export function SourceCitation({
  children,
  href,
  title,
  detail,
}: {
  children: ReactElement<ComponentProps<'a'>>;
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <InlineCitation className="not-prose align-baseline" data-slot="source-citation">
      <InlineCitationCard openDelay={150} closeDelay={150}>
        <InlineCitationCardTrigger
          asChild
          sources={[href]}
          className="ml-0 h-auto max-w-full min-w-0 align-baseline whitespace-normal [overflow-wrap:anywhere] no-underline"
        >
          {children}
        </InlineCitationCardTrigger>
        <InlineCitationCardBody className="w-80 max-w-[calc(100vw-2rem)] p-0">
          {cloneElement(children, {
            id: undefined,
            className:
              'block min-w-0 rounded-lg p-3 text-foreground no-underline hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            children: (
              <InlineCitationSource
                title={title}
                url={detail}
                className="[&_h4]:overflow-visible [&_h4]:whitespace-normal [&_h4]:[overflow-wrap:anywhere] [&_p]:whitespace-normal [&_p]:[overflow-wrap:anywhere]"
              />
            ),
          })}
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
}
