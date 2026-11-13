import { BrandIcon } from './brand-icon';
import { brand } from '@brand';
import type { ReactNode } from 'react';
import { t, ph } from '@lingui/core/macro';

export interface ClioConversationWelcomeProps {
  /** The composer, under the welcome line. */
  children: ReactNode;
  /** The “In [workspace] with [agent] Customize” line, supplied by the draft page; omitted when nothing can change. */
  context?: ReactNode;
}

/** An empty conversation: the brand mark, one line of welcome, its context, then the composer. */
export function ClioConversationWelcome({ children, context }: ClioConversationWelcomeProps) {
  return (
    <section
      aria-label={t`${ph({ name: brand.name })} conversation welcome`}
      className="mx-auto flex w-full max-w-4xl min-w-0 flex-col"
    >
      <div className="flex flex-col items-center gap-2.5 pb-3 text-center text-muted-foreground">
        <BrandIcon className="size-[22px]" />
        <h3 className="font-heading text-welcome leading-6 font-medium text-foreground">
          {brand.workspace.greeting}
        </h3>
      </div>
      {context ? (
        <div
          data-slot="conversation-welcome-context"
          className="mb-3.5 flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap text-menu text-muted-foreground"
        >
          {context}
        </div>
      ) : null}
      <div className="w-full min-w-0">{children}</div>
    </section>
  );
}
