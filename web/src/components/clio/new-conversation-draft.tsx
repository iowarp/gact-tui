import { brand } from '@brand';
import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { BrandIcon } from './brand-icon';

/**
 * Where the draft lives: the workspace name, then the italic "New
 * conversation" that marks a conversation not yet created. Desktop draws
 * the same trail in its native title bar.
 */
export function NewConversationBreadcrumb({ workspaceLabel }: { workspaceLabel?: string }) {
  if (inTauri()) return null;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px] whitespace-nowrap">
        {workspaceLabel ? (
          <li className="flex min-w-0 shrink-[3] items-center gap-1.5 text-muted-foreground">
            <span className="min-w-[4ch] truncate" title={workspaceLabel}>
              {workspaceLabel}
            </span>
            <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0" />
          </li>
        ) : null}
        <li aria-current="page" className="shrink-0 font-medium italic">
          New conversation
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
      aria-label={`${brand.name} new conversation`}
      className="mx-auto flex w-full max-w-2xl flex-col items-center"
    >
      <BrandIcon className="size-9 text-primary" />
      <h1 className="mt-4 text-center font-heading text-[26px] leading-tight font-semibold tracking-[-0.01em] text-balance">
        {brand.workspace.greeting}
      </h1>
      <div className="mt-5 flex max-w-full min-w-0 items-center gap-1.5 text-[13px] whitespace-nowrap text-muted-foreground">
        {setup}
      </div>
      <div className="mt-4 w-full">{children}</div>
    </section>
  );
}
