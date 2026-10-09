import { brand } from '@brand';
import { ArrowUpRightIcon, SparklesIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExternalLink } from '@/components/ui/external-link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ChangelogEntry } from '@/lib/changelog';
import {
  desktopChangesSince,
  hasProductChangelog,
  interfaceChangesSince,
  readSeen,
  writeSeen,
} from '@/lib/desktop-changelog';
import { displayReleaseVersion } from '@/lib/release-version';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { readPendingUpdateMarker } from '@/store/update-flow-store';
import { ReleaseChanges } from './whats-new-release-changes';

/** Notes and release identity for one independently versioned product. */
export interface WhatsNewTab {
  id: string;
  label: string;
  version: string;
  description: string;
  entries: ChangelogEntry[];
  releaseUrl?: string | null;
}

/** Show bundled product and interface notes after an installed-app update. */
export function WhatsNewDialog() {
  const [tabs, setTabs] = useState<WhatsNewTab[]>([]);
  const [open, setOpen] = useState(false);
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
          const nativeVersion = displayReleaseVersion(raw);
          if (disposed || !nativeVersion) return;
          const uiVersion = displayReleaseVersion(import.meta.env.VITE_CLIO_WORKSPACE_VERSION);
          const productNotes = hasProductChangelog();
          const previousNative = readSeen();
          const separateUiIdentity = !productNotes && uiVersion && uiVersion !== nativeVersion;
          const current = productNotes ? nativeVersion : (uiVersion ?? nativeVersion);
          const previous = separateUiIdentity ? readSeen('interface') : previousNative;
          const entries = desktopChangesSince(
            previous,
            current,
            justUpdatedDesktop ||
              Boolean(separateUiIdentity && previousNative && previousNative !== nativeVersion),
          );
          const nextTabs: WhatsNewTab[] = [];
          if (entries.length) {
            nextTabs.push({
              id: 'desktop',
              label: hasProductChangelog() ? `${brand.wordmark} release` : 'Interface',
              version: current,
              description: hasProductChangelog()
                ? 'Agent, tools and application changes shipped in this release.'
                : 'Desktop and workspace interface changes.',
              entries,
              releaseUrl: separateUiIdentity ? undefined : brand.desktopReleaseUrl,
            });
          }
          if (productNotes && uiVersion) {
            // Older builds recorded only the native version. On that first
            // migration show this UI build's notes, not its entire history.
            const uiEntries = interfaceChangesSince(
              readSeen('interface'),
              uiVersion,
              justUpdatedDesktop || Boolean(previousNative && previousNative !== nativeVersion),
            );
            if (uiEntries.length) {
              nextTabs.push({
                id: 'interface',
                label: 'Interface',
                version: uiVersion,
                description: 'Desktop and workspace interface changes.',
                entries: uiEntries,
              });
            }
          }
          if (uiVersion) writeSeen(uiVersion, 'interface');
          writeSeen(nativeVersion);
          if (!nextTabs.length) return;
          setTabs(nextTabs);
          setOpen(true);
        },
        (error: unknown) => console.error("What's new: desktop version unavailable", error),
      );
    return () => {
      disposed = true;
    };
  }, [justUpdatedDesktop]);

  if (!tabs.length) return null;
  return <WhatsNewReleaseDialog onOpenChange={setOpen} open={open} tabs={tabs} />;
}

/** Shared release-note presentation; the installed-app wrapper supplies real versions. */
export function WhatsNewReleaseDialog({
  tabs,
  open,
  onOpenChange,
}: {
  tabs: WhatsNewTab[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!tabs.length) return null;
  const releaseUrl = tabs.find((tab) => tab.releaseUrl)?.releaseUrl;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="grid max-h-[min(800px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden sm:max-w-3xl">
        <DialogHeader className="pb-5">
          <div className="flex items-center gap-3 pr-8">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <SparklesIcon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 space-y-2">
              <DialogTitle className="text-xl font-semibold">What&apos;s new</DialogTitle>
              <DialogDescription>Explore what changed in your update.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {tabs.length === 1 ? (
          <ReleaseChanges tab={tabs[0]} />
        ) : (
          <Tabs className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]" defaultValue={tabs[0].id}>
            <TabsList
              variant="line"
              className="mb-4 h-auto w-full justify-start gap-2 border-b p-0 pb-2 group-data-horizontal/tabs:h-auto"
            >
              {tabs.map((tab) => (
                <TabsTrigger
                  className="h-auto min-h-14 min-w-0 flex-col items-start gap-1 px-3 py-2 data-[state=active]:text-primary"
                  key={tab.id}
                  value={tab.id}
                >
                  <span>{tab.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{tab.version}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((tab) => (
              <TabsContent className="mt-0 grid min-h-0" key={tab.id} value={tab.id}>
                <ReleaseChanges tab={tab} />
              </TabsContent>
            ))}
          </Tabs>
        )}
        <DialogFooter className="mt-4 flex-row items-center justify-between sm:justify-between">
          {releaseUrl ? (
            <ExternalLink
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              href={releaseUrl}
            >
              Release history <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
            </ExternalLink>
          ) : (
            <span className="text-xs text-muted-foreground">Notes included with this build</span>
          )}
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
