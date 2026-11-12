import type { ReactNode } from 'react';
import { MarkdownText } from '@/components/ai-elements/markdown';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { changelogSections, type ChangelogEntry } from '@/lib/changelog';
import { cn } from '@/lib/utils';
import type { WhatsNewTab } from './whats-new-dialog';

const LIST =
  'text-menu leading-[1.7] font-normal text-foreground [&_strong]:font-semibold [&_code]:wrap-anywhere [&_code]:font-normal [&_pre]:max-w-full [&_pre]:overflow-x-auto';

// The spec's plain bullet list rather than the transcript's spaced prose lists.
const COMPONENTS = {
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc pl-[18px]">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-[18px]">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  p: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
};

/** The changes as one short list; a version line only when the update spans several. */
export function ReleaseChanges({
  tab,
  expanded = false,
}: {
  tab: WhatsNewTab;
  expanded?: boolean;
}) {
  if (!tab.entries.length) return null;
  const several = tab.entries.length > 1;
  return (
    <div
      aria-label={`${tab.label} changes`}
      role="region"
      tabIndex={0}
      className={cn(
        'clio-scrollbar -mr-2 overflow-y-auto pt-2.5 pr-2 outline-none focus-visible:ring-1 focus-visible:ring-ring',
        expanded ? 'max-h-[min(70vh,640px)]' : 'max-h-[min(46vh,360px)]',
      )}
    >
      {tab.entries.map((entry) => (
        <section key={entry.version} aria-label={`Version ${entry.version}`} className="pb-2">
          {several ? <ReleaseHeading entry={entry} /> : null}
          <ReleaseBody entry={entry} />
        </section>
      ))}
    </div>
  );
}

function ReleaseHeading({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="mt-1 flex items-baseline gap-2 text-label text-muted-foreground">
      <span className="font-medium text-foreground">{entry.version}</span>
      {entry.date ? <time dateTime={entry.date}>{entry.date}</time> : null}
    </div>
  );
}

function ReleaseBody({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="space-y-1.5">
      {changelogSections(entry.body).map((section, index) => {
        const content = (
          <MarkdownText mode="static" className={LIST} components={COMPONENTS}>
            {section.body}
          </MarkdownText>
        );
        if (section.title && /^(notes|technical details|internal changes)$/iu.test(section.title)) {
          return (
            <Accordion key={index} type="single" collapsible>
              <AccordionItem value="notes" className="border-0">
                <AccordionTrigger className="py-1 text-label font-normal text-muted-foreground hover:no-underline">
                  {section.title}
                </AccordionTrigger>
                <AccordionContent className="pb-1">{content}</AccordionContent>
              </AccordionItem>
            </Accordion>
          );
        }
        return (
          <div key={index}>
            {section.title ? (
              <h4 className="mt-1 text-label font-medium text-muted-foreground">
                {section.title}
              </h4>
            ) : null}
            {content}
          </div>
        );
      })}
    </div>
  );
}
