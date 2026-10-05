import type { AttentionProfile } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InfoTip } from './info-tip';

/** Edits resolved numerical assumptions; Apply reuses the existing capture. */
export function AttentionProfileEditor({
  profile,
  onApply,
}: {
  profile: AttentionProfile;
  onApply: (profile: AttentionProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(profile);
  const update = (key: keyof AttentionProfile, value: string | number) =>
    setDraft((current) => ({ ...current, name: 'custom', [key]: value }));
  const valid =
    Number.isFinite(draft.decay_base) &&
    (draft.decay_base ?? 0) > 0 &&
    (draft.decay_base ?? 0) <= 1;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setDraft(profile);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="xs">
          Heat profile: {profile.name}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attention heat profile</DialogTitle>
          <DialogDescription>Recompute this selection from its existing capture.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft({
                ...profile,
                name: 'uniform-mean',
                metric: 'mean',
                weighting: 'uniform',
                direction: 'forward',
                decay_base: 0.5,
                weight_normalization: 'sum',
                block_reduction: 'sum',
                display_scaling: 'max',
              })
            }
          >
            Uniform mean
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft({
                ...profile,
                name: 'decayed-max',
                metric: 'max',
                weighting: 'exponential',
                direction: 'forward',
                decay_base: 0.5,
                weight_normalization: 'sum',
                block_reduction: 'max',
                display_scaling: 'max',
              })
            }
          >
            Decayed maximum
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              [
                'metric',
                'Captured values',
                [
                  ['mean', 'Mean'],
                  ['max', 'Maximum'],
                ],
              ],
              [
                'weighting',
                'Step weights',
                [
                  ['uniform', 'Equal'],
                  ['exponential', 'Exponential'],
                ],
              ],
              [
                'direction',
                'Decay starts at',
                [
                  ['forward', 'First selected step'],
                  ['reverse', 'Last selected step'],
                ],
              ],
              [
                'weight_normalization',
                'Weight normalization',
                [
                  ['sum', 'Sum to one'],
                  ['none', 'None'],
                ],
              ],
              [
                'block_reduction',
                'Source block score',
                [
                  ['sum', 'Sum'],
                  ['mean', 'Mean per token'],
                  ['max', 'Maximum token'],
                ],
              ],
              [
                'display_scaling',
                'Display scale',
                [
                  ['max', 'Selection maximum'],
                  ['none', 'Raw values'],
                ],
              ],
            ] as const
          ).map(([key, label, options]) => (
            <div className="space-y-1.5" key={key}>
              <Label htmlFor={`attention-${key}`}>{label}</Label>
              <Select value={draft[key]} onValueChange={(value) => update(key, value)}>
                <SelectTrigger id={`attention-${key}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map(([value, title]) => (
                    <SelectItem value={value} key={value}>
                      {title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="attention-decay">Decay base</Label>
            <Input
              id="attention-decay"
              type="number"
              min="0.001"
              max="1"
              step="0.05"
              disabled={draft.weighting !== 'exponential'}
              value={draft.decay_base}
              onChange={(event) => update('decay_base', event.target.valueAsNumber)}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Mass stays comparable
            <InfoTip label="About attention heat and mass">
              Heat follows this profile. Source shares and residual remain uniform mean attention
              mass. Maximum-based heat is not a percentage or evidence of poisoning. All selected
              captured steps are included, with no inferred removal of formatting tokens.
            </InfoTip>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!valid}
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Apply profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
