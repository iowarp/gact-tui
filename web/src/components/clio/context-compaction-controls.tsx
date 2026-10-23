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
    <ContextDisclosure label="Compaction settings">
      <div className="grid gap-3 text-xs">
        <label className="flex items-center justify-between gap-3">
          <span>Automatic compaction</span>
          <Switch
            aria-label="Automatic compaction"
            checked={enabled}
            disabled={!onUpdatePreferences || preferencesPending}
            onCheckedChange={(checked) =>
              void onUpdatePreferences?.({ automatic_compaction: checked })
            }
          />
        </label>
        <p className="text-muted-foreground">Summarize older context before the window fills.</p>
        <div className="flex items-center gap-3">
          <Slider
            aria-label="Automatic compaction threshold"
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
              {compactPending ? 'Compacting…' : 'Compact now'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Compact this agent&apos;s working context?</AlertDialogTitle>
              <AlertDialogDescription>
                Replace older context with a summary. The conversation and saved snapshots remain
                available.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void onCompact?.()}>Compact now</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ContextDisclosure>
  );
}
