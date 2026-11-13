import type { ContextSnapshot } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ContextDisclosure } from './context-disclosure';
import { t } from '@lingui/core/macro';

export function ContextCompactionControls({
  context,
  compactPending,
  preferencesPending,
  onCompact,
  onUpdatePreferences,
}: {
  context: ContextSnapshot;
  compactPending?: boolean;
  preferencesPending?: boolean;
  onCompact?: () => Promise<unknown>;
  onUpdatePreferences?: (input: {
    automatic_compaction?: boolean;
    autocompact_pct?: number;
  }) => Promise<unknown>;
}) {
  const enabled = context.autocompact_enabled ?? true;
  const threshold = Math.round((context.autocompact_pct ?? 0.85) * 100);
  const [draft, setDraft] = useState<number>();
  return (
    <ContextDisclosure label={t`Compaction settings`}>
      <div className="grid gap-3 text-xs">
        <label className="flex items-center justify-between gap-3">
          <span>{t`Automatic compaction`}</span>
          <Switch
            aria-label={t`Automatic compaction`}
            checked={enabled}
            disabled={!onUpdatePreferences || preferencesPending}
            onCheckedChange={(checked) =>
              void onUpdatePreferences?.({ automatic_compaction: checked })
            }
          />
        </label>
        <p className="text-muted-foreground">{t`Summarize older context before the window fills.`}</p>
        <div className="flex items-center gap-3">
          <Slider
            aria-label={t`Automatic compaction threshold`}
            min={50}
            max={95}
            step={5}
            value={[draft ?? threshold]}
            disabled={!enabled || !onUpdatePreferences || preferencesPending}
            onValueChange={(value) => setDraft(value[0])}
            onValueCommit={(value) => {
              if (value[0] !== undefined && value[0] !== threshold)
                void onUpdatePreferences?.({ autocompact_pct: value[0] / 100 });
              setDraft(undefined);
            }}
          />
          <span className="tabular-nums">{draft ?? threshold}%</span>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              disabled={!onCompact || !context.live_block_count || compactPending}
            >
              {compactPending ? t`Compacting…` : t`Compact now`}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t`Compact this agent's working context?`}</AlertDialogTitle>
              <AlertDialogDescription>
                {t`Replace older context with a summary. The conversation and saved snapshots remain available.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void onCompact?.()}
              >{t`Compact now`}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ContextDisclosure>
  );
}
