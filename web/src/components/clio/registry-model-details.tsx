import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon, BookOpenIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { registryModelTags } from '@/lib/registry-model-tags';
import { displayedTags } from '@/lib/model-capability-tags';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
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

/** Concise capability summary; the complete card opens over the chooser without losing its state. */
export function RegistryModelDetails({
  repository: modelId,
}: {
  repository: string;
  compact?: boolean;
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
          <DialogContent className="flex h-[min(54rem,calc(100dvh-2rem))] flex-col overflow-hidden sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>{modelId}</DialogTitle>
              <DialogDescription>Model card</DialogDescription>
            </DialogHeader>
            {model ? <RegistryModelCard model={model} /> : null}
          </DialogContent>
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
