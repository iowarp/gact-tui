import { useContext } from 'react';
import type { MessageBlock } from '@clio/core/v3';
import { ArrowRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GoalIcon } from '@/lib/icon-vocabulary';
import { PresentationNavigation } from './presentation-navigation';
import { t } from '@lingui/core/macro';

/** A retained Goal command result, with a single action to inspect its Work view. */
export function GoalNotice({ block }: { block: Extract<MessageBlock, { type: 'notice' }> }) {
  const navigation = useContext(PresentationNavigation);
  const title =
    block.code === 'goal_started'
      ? t`Goal started`
      : block.code === 'goal_stopped'
        ? t`Goal stopped`
        : block.code === 'goal_rejected'
          ? t`Goal could not start`
          : t`Goal`;
  const content = (
    <>
      <GoalIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" data-slot="goal-icon" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {block.text ? (
          <span className="mt-0.5 block whitespace-pre-wrap text-xs font-normal text-muted-foreground [overflow-wrap:anywhere]">
            {block.text}
          </span>
        ) : null}
      </span>
      {navigation?.onOpenWork ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground">
          {t`Open Work`} <ArrowRightIcon aria-hidden="true" className="size-3.5" />
        </span>
      ) : null}
    </>
  );
  const className =
    'flex h-auto w-full min-w-0 max-w-xl items-start justify-start gap-2 rounded-lg border bg-muted/20 p-3 text-left text-sm';
  return navigation?.onOpenWork ? (
    <Button
      type="button"
      variant="ghost"
      className={className}
      data-slot="goal-notice"
      aria-label={t`${title}. Open Work`}
      onClick={navigation.onOpenWork}
    >
      {content}
    </Button>
  ) : (
    <div className={className} data-slot="goal-notice">
      {content}
    </div>
  );
}
