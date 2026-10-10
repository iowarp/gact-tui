import { MarkdownText } from '@/components/ai-elements/markdown';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { changelogSections, type ChangelogEntry } from '@/lib/changelog';
import type { WhatsNewTab } from './whats-new-dialog';

/** Keep the newest notes visible, with older releases available on demand. */
export function ReleaseChanges({ tab }: { tab: WhatsNewTab }) {
  const [latest, ...older] = tab.entries;
  if (!latest) return null;
  return (
    <ScrollArea
      className="min-h-0 pr-3"
      viewportProps={{ 'aria-label': `${tab.label} changes`, role: 'region', tabIndex: 0 }}
    >
      <div className="space-y-5 pb-2">
        <p className="text-xs leading-5 text-muted-foreground">{tab.description}</p>
        <section aria-label={`Version ${latest.version}`}>
          <ReleaseHeading entry={latest} />
          <ReleaseBody entry={latest} />
        </section>
        {older.length ? (
          <div className="border-t pt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Earlier changes in this update
            </p>
            <Accordion type="multiple">
              {older.map((entry) => (
                <AccordionItem key={entry.version} value={entry.version}>
                  <AccordionTrigger>
                    <ReleaseHeading entry={entry} compact />
                  </AccordionTrigger>
                  <AccordionContent>
                    <ReleaseBody entry={entry} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function ReleaseHeading({ entry, compact = false }: { entry: ChangelogEntry; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className={compact ? 'text-sm font-medium' : 'text-base font-semibold'}>
        Version {entry.version}
      </span>
      {entry.date ? (
        <time className="text-xs font-normal text-muted-foreground" dateTime={entry.date}>
          {entry.date}
        </time>
      ) : null}
    </div>
  );
}

function ReleaseBody({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="mt-3 space-y-5">
      {changelogSections(entry.body).map((section, index) => {
        const content = (
          <MarkdownText
            mode="static"
            className="text-sm font-normal leading-6 [&_p]:font-normal [&_li]:font-normal [&_li]:pl-1 [&_li+li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold [&_code]:wrap-anywhere [&_code]:font-normal [&_pre]:max-w-full [&_pre]:overflow-x-auto"
          >
            {section.body}
          </MarkdownText>
        );
        if (section.title && /^(notes|technical details|internal changes)$/iu.test(section.title)) {
          return (
            <Accordion key={index} type="single" collapsible>
              <AccordionItem value="notes" className="border-t">
                <AccordionTrigger className="text-xs text-muted-foreground">
                  {section.title}
                </AccordionTrigger>
                <AccordionContent>{content}</AccordionContent>
              </AccordionItem>
            </Accordion>
          );
        }
        return (
          <div key={index} className="space-y-2">
            {section.title ? (
              <h4 className="text-xs font-semibold tracking-wide text-primary">{section.title}</h4>
            ) : null}
            {content}
          </div>
        );
      })}
    </div>
  );
}
