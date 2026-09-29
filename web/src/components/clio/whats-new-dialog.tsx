import { brand } from '@brand';
import { SparklesIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ChangelogEntry } from '@/lib/changelog';
import { desktopChangesSince, readSeen, writeSeen } from '@/lib/desktop-changelog';
import { displayReleaseVersion } from '@/lib/release-version';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { readPendingUpdateMarker } from '@/store/update-flow-store';

/** One product's changes since the version the person last ran. */
export interface WhatsNewTab {
  id: string;
  label: string;
  entries: ChangelogEntry[];
}

/**
 * "What's new" after an update: a centered window with one tab per updated
 * product (the tab bar appears only when more than one has news), each
 * rendering that product's changelog sections since the last version run.
 */
export function WhatsNewDialog() {
  const [tabs, setTabs] = useState<WhatsNewTab[]>([]);
  const [open, setOpen] = useState(false);
  // Read on the first render: the restart-recovery flow clears this marker
  // once the backend reconnects.
  const [justUpdatedDesktop] = useState(() => {
    const action = readPendingUpdateMarker()?.action;
    return action === 'desktop' || action === 'both';
  });

  useEffect(() => {
    if (!inTauri()) return;
    let disposed = false;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then(
        (raw) => {
          const current = displayReleaseVersion(raw);
          if (disposed || !current) return;
          const entries = desktopChangesSince(readSeen(), current, justUpdatedDesktop);
          writeSeen(current);
          if (entries.length === 0) return;
          setTabs([{ id: 'desktop', label: `${brand.wordmark} app`, entries }]);
          setOpen(true);
        },
        (error: unknown) => console.error("What's new: desktop version unavailable", error),
      );
    return () => {
      disposed = true;
    };
  }, [justUpdatedDesktop]);

  if (tabs.length === 0) return null;
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className="grid max-h-[min(760px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <SparklesIcon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>What&apos;s new</DialogTitle>
              <DialogDescription className="mt-1">
                {brand.wordmark} was updated. Here is what changed.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {tabs.length === 1 ? (
          <ChangeList entries={tabs[0].entries} />
        ) : (
          <Tabs className="min-h-0" defaultValue={tabs[0].id}>
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((tab) => (
              <TabsContent className="min-h-0" key={tab.id} value={tab.id}>
                <ChangeList entries={tab.entries} />
              </TabsContent>
            ))}
          </Tabs>
        )}
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeList({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <ScrollArea className="min-h-0 pr-3">
      <div className="grid gap-6">
        {entries.map((entry) => (
          <section key={entry.version}>
            <h3 className="text-sm font-semibold">
              Version {entry.version}
              {entry.date ? (
                <span className="ml-2 font-normal text-muted-foreground">{entry.date}</span>
              ) : null}
            </h3>
            <MarkdownText className="mt-2 text-sm leading-6">{entry.body}</MarkdownText>
          </section>
        ))}
      </div>
    </ScrollArea>
  );
}
