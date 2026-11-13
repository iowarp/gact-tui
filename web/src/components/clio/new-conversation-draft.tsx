import { brand } from '@brand';
import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { BrandIcon } from './brand-icon';
import { WorkspaceCrumbMark } from './workspace-mark';
import { t, ph } from '@lingui/core/macro';

/**
 * Where the draft lives: the workspace's mark and name (a chat bubble for
 * Conversations), then the italic "New conversation" that marks a
 * conversation not yet created. Desktop draws the same trail in its native
 * title bar.
 */
export function NewConversationBreadcrumb({
  workspaceId,
  workspaceLabel,
}: {
  workspaceId?: string;
  workspaceLabel?: string;
}) {
  if (inTauri()) return null;
  return (
    <nav aria-label={t`Breadcrumb`} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-ui whitespace-nowrap">
        {workspaceLabel ? (
          // Phones drop the workspace crumb, as the conversation top bar does.
          <li className="flex min-w-0 shrink-[3] items-center gap-1.5 text-muted-foreground max-sm:hidden">
            {workspaceId ? <WorkspaceCrumbMark id={workspaceId} /> : null}
            <span className="min-w-[4ch] truncate" title={workspaceLabel}>
              {workspaceLabel}
            </span>
            <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0" />
          </li>
        ) : null}
        <li aria-current="page" className="shrink-0 font-medium italic">
          {t`New conversation`}
        </li>
      </ol>
    </nav>
  );
}

/**
 * The draft screen: the brand mark, one greeting, the line that says where
 * and with which agent the conversation will run, then the composer. Nothing
 * is created until the first message is sent.
 */
export function NewConversationDraft({
  setup,
  children,
}: {
  /** The "In [workspace] with [agent] Customize" line. */
  setup: ReactNode;
  /** The composer. */
  children: ReactNode;
}) {
  return (
    <section
      aria-label={t`${ph({ name: brand.name })} new conversation`}
      className="@container/draft mx-auto flex w-full max-w-2xl flex-col items-center"
    >
      <BrandIcon className="size-[22px] text-muted-foreground" />
      <h1 className="mt-2.5 text-center font-heading text-welcome leading-6 font-medium text-balance">
        {brand.workspace.greeting}
      </h1>
      <div className="mt-3 flex max-w-full min-w-0 items-center gap-1.5 text-menu whitespace-nowrap text-muted-foreground">
        {setup}
      </div>
      <div className="mt-3.5 w-full">{children}</div>
    </section>
  );
}
