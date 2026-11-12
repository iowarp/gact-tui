import { brand } from '@brand';
import { ExternalLinkIcon, Maximize2Icon, Minimize2Icon, SparklesIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ExternalLink } from '@/components/ui/external-link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdjustIcon } from '@/lib/icon-vocabulary';
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
import { cn } from '@/lib/utils';
import { readPendingUpdateMarker } from '@/store/update-flow-store';
import { BrandIcon } from './brand-icon';
import { DialogFrame } from './primitives/dialog-frame';
import { FrameTab } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { ReleaseChanges } from './whats-new-release-changes';

/** Notes and release identity for one independently versioned product. */
export interface WhatsNewTab {
  id: string;
  /** The product name; the tab reads `label version`. */
  label: string;
  /** The interface tab shows the sliders; a product tab its brand mark. */
  kind?: 'product' | 'interface';
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
              label: productNotes ? brand.wordmark : 'Interface',
              kind: productNotes ? 'product' : 'interface',
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
                kind: 'interface',
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
  const [active, setActive] = useState(() => tabs[0]?.id ?? '');
  const [expanded, setExpanded] = useState(false);
  if (!tabs.length) return null;
  const current = tabs.some((tab) => tab.id === active) ? active : tabs[0].id;
  const releaseUrl = tabs.find((tab) => tab.releaseUrl)?.releaseUrl;
  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      icon={<SparklesIcon />}
      title="What's new"
      description="What changed in your update."
      cancelLabel={null}
      confirm={{ label: 'Got it', onConfirm: () => onOpenChange(false), key: 'Enter' }}
      className={cn(expanded && 'w-[min(880px,calc(100vw-2rem))]')}
      footerStart={
        releaseUrl ? (
          <ExternalLink
            className="inline-flex items-center gap-1.5 hover:text-foreground"
            href={releaseUrl}
          >
            <ExternalLinkIcon aria-hidden="true" className="size-[13px]" />
            Release history
          </ExternalLink>
        ) : (
          <span>Notes included with this build</span>
        )
      }
    >
      <Tabs value={current} onValueChange={setActive} className="gap-0">
        <div className="-mx-2 flex h-10 min-w-0 items-center border-b border-border">
          <TabsList className="h-10 min-w-0 flex-1 justify-start gap-0.5 overflow-hidden rounded-none bg-transparent p-0">
            {tabs.map((tab) => {
              const name = `${tab.label} ${tab.version}`;
              return (
                <FrameTab
                  key={tab.id}
                  active={tab.id === current}
                  icon={
                    tab.kind === 'interface' ? <AdjustIcon /> : <BrandIcon className="size-3.5" />
                  }
                  label={name}
                  title={tab.description}
                  className="data-active:shadow-[inset_0_-2px_0_var(--primary)]"
                  renderTrigger={({ className, children }) => (
                    <TabsTrigger
                      className={`${className} h-full justify-start border-0 bg-transparent py-0 text-menu font-normal text-inherit shadow-none data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent`}
                      value={tab.id}
                    >
                      {children}
                    </TabsTrigger>
                  )}
                />
              );
            })}
          </TabsList>
          <IconButton
            label={expanded ? 'Restore size' : 'Expand'}
            icon={expanded ? <Minimize2Icon /> : <Maximize2Icon />}
            size="sm"
            className="mr-0.5 text-muted-foreground"
            onClick={() => setExpanded((value) => !value)}
          />
        </div>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-0 min-w-0">
            <ReleaseChanges tab={tab} expanded={expanded} />
          </TabsContent>
        ))}
      </Tabs>
    </DialogFrame>
  );
}
