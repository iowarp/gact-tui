import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ModelRegistryDetails } from '@clio/core/v3';
import {
  BookOpenIcon,
  CircleAlertIcon,
  CpuIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HardDriveIcon,
  LayersIcon,
  MessageSquareTextIcon,
  PinIcon,
  SparklesIcon,
} from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { registryModelTags } from '@/lib/registry-model-tags';
import {
  displayedTags,
  formatContextSize,
  modelCapabilityTagLabel,
} from '@/lib/model-capability-tags';
import { hubTaskLabel } from '@/lib/model-facets';
import { modelFactSummary, parameterSizeLabel } from '@/lib/model-facts';
import { formatBytes } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ModelCapabilityTags } from './model-capability-tags';
import { RegistryModelCard } from './registry-model-card';
import { IconButton, NamedTooltip } from './primitives/icon-button';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { StatusIndicator } from './primitives/status-indicator';
import { SourceStatusLine } from './source-form-parts';

function ModelCardDialog({ modelId, model }: { modelId: string; model?: ModelRegistryDetails }) {
  return (
    <DialogContent className="flex h-[min(54rem,calc(100dvh-2rem))] flex-col overflow-hidden sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>{modelId}</DialogTitle>
        <DialogDescription>Model card</DialogDescription>
      </DialogHeader>
      {model ? <RegistryModelCard model={model} /> : null}
    </DialogContent>
  );
}

/** The chooser's details pane (`.c3pane`): the name with its card links, then `.c3kv` facts. */
function CompactModelDetails({
  modelId,
  model,
  pending,
  error,
  task,
  sizeBytes,
}: {
  modelId: string;
  model?: ModelRegistryDetails;
  pending: boolean;
  error: Error | null;
  task?: string | null;
  sizeBytes?: number | null;
}) {
  const [cardOpen, setCardOpen] = useState(false);
  const tags = model ? displayedTags(registryModelTags(model)) : [];
  const taskTag = tags.find((tag) => tag.axis === 'task');
  const taskLabel = task ? hubTaskLabel(task) : taskTag && modelCapabilityTagLabel(taskTag);
  const parameters = parameterSizeLabel(modelFactSummary(model?.model_facts).parameters);
  const license = model?.hub_tags
    ?.find((tag) => tag.startsWith('license:'))
    ?.slice('license:'.length);
  const capabilities = tags
    .filter((tag) => tag !== taskTag && tag.axis !== 'size' && tag.axis !== 'context')
    .map(modelCapabilityTagLabel)
    .join(', ');
  // Spec `.c3kv`: every fact leads with its icon, so the labels share one x.
  const items: KeyValueItem[] = [
    ...(taskLabel ? [{ label: 'Task', icon: <LayersIcon />, value: taskLabel }] : []),
    ...(parameters
      ? [{ label: 'Parameters', icon: <CpuIcon />, value: parameters, mono: true }]
      : []),
    ...(sizeBytes
      ? [{ label: 'Size', icon: <HardDriveIcon />, value: formatBytes(sizeBytes), mono: true }]
      : []),
    ...(license ? [{ label: 'License', icon: <FileTextIcon />, value: license, mono: true }] : []),
    ...(model?.context_window
      ? [
          {
            label: 'Context',
            icon: <MessageSquareTextIcon />,
            value: `${formatContextSize(model.context_window)} tokens`,
            mono: true,
          },
        ]
      : []),
    ...(capabilities
      ? [{ label: 'Capabilities', icon: <SparklesIcon />, value: capabilities }]
      : []),
    ...(model?.revision
      ? [
          {
            label: 'Pinned source',
            icon: <PinIcon />,
            value: model.revision.slice(0, 12),
            title: model.revision,
            mono: true,
          },
        ]
      : []),
  ];
  return (
    <TooltipProvider>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-h-7 min-w-0 items-center gap-2">
          <ModelSelectorLogo
            aria-hidden="true"
            className="size-4 rounded-none bg-transparent text-muted-foreground [&>span]:size-4"
            provider="huggingface"
          />
          <h3 className="min-w-0 flex-1 truncate text-ui font-semibold" title={modelId}>
            {modelId}
          </h3>
          <IconButton
            icon={<BookOpenIcon />}
            label="Model card"
            // Find a model renders these facts inside its download form.
            type="button"
            disabled={!model}
            onClick={() => setCardOpen(true)}
          />
          <NamedTooltip label="Hugging Face">
            <Button asChild variant="ghost" size="icon-sm" className="size-7 text-muted-foreground">
              <ExternalLink aria-label="Hugging Face" href={`https://huggingface.co/${modelId}`}>
                <ExternalLinkIcon aria-hidden="true" />
              </ExternalLink>
            </Button>
          </NamedTooltip>
        </div>
        {pending ? (
          <div role="status" className="flex min-h-[25px] items-center text-meta">
            <StatusIndicator label="Reading model details…" tone="running" />
          </div>
        ) : null}
        {error ? (
          <SourceStatusLine icon={<CircleAlertIcon />} role="alert" tone="error">
            Model details could not load: {error.message}
          </SourceStatusLine>
        ) : null}
        {items.length ? (
          <KeyValueGrid
            aria-label={`About ${modelId}`}
            className="grid-cols-[40%_minmax(0,1fr)] gap-x-2.5 gap-y-0 [&>div>dd]:leading-[1.5625rem] [&>div>dt]:min-h-[1.5625rem]"
            items={items}
          />
        ) : null}
      </div>
      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <ModelCardDialog model={model} modelId={modelId} />
      </Dialog>
    </TooltipProvider>
  );
}

/** Concise capability summary; the complete card opens over the chooser without losing its state. */
export function RegistryModelDetails({
  repository: modelId,
  compact,
  task,
  sizeBytes,
}: {
  repository: string;
  /** The chooser's details pane: a title row with icon links, then label-value facts. */
  compact?: boolean;
  /** The Hub task from the search result, when known. */
  task?: string | null;
  /** The download size from the search result, when known. */
  sizeBytes?: number | null;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const details = useQuery({
    queryKey: ['registry-model-details', settings.endpoint, modelId],
    queryFn: ({ signal }) => repository.modelRegistryDetails(modelId, signal),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const model = details.data;
  if (compact) {
    return (
      <CompactModelDetails
        error={details.error}
        model={model}
        modelId={modelId}
        pending={details.isPending}
        sizeBytes={sizeBytes}
        task={task}
      />
    );
  }
  return (
    <div className="space-y-4">
      {model ? <ModelCapabilityTags tags={displayedTags(registryModelTags(model))} /> : null}
      {details.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Reading model details…
        </p>
      ) : null}
      {details.error ? (
        <p role="alert" className="text-sm text-destructive">
          Model details could not load: {details.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={!model}>
              <BookOpenIcon aria-hidden="true" />
              Model card
            </Button>
          </DialogTrigger>
          <ModelCardDialog model={model} modelId={modelId} />
        </Dialog>
        <Button asChild variant="ghost" size="sm">
          <ExternalLink href={`https://huggingface.co/${modelId}`}>
            Hugging Face
            <ExternalLinkIcon aria-hidden="true" />
          </ExternalLink>
        </Button>
      </div>
    </div>
  );
}
