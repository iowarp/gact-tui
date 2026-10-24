import type { PluginReview } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  CodeIcon,
  FileTextIcon,
  FileWarningIcon,
  GlobeIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TerminalIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { pluginReachLabel, type FlowTrustRequest } from '@/lib/plugin-review';
import { PluginFlowShape } from './plugin-flow-shape';
import { TechnicalDetails } from './technical-details';

const REACH_ICONS: Record<string, LucideIcon> = {
  files: FileTextIcon,
  network: GlobeIcon,
  commands: TerminalIcon,
  'dynamic code': CodeIcon,
};

/**
 * The plugin behind a flow-trust permission, made quick to review: what it
 * does, each flow's diagram, what its code reaches by itself in plain words,
 * and its code one click further. Read from the plugin's files without
 * running them, only while open.
 */
export function PluginReviewDialog({
  request,
  open,
  onOpenChange,
}: {
  request: FlowTrustRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-y-1/2 overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words">The {request.plugin} plugin</DialogTitle>
          <DialogDescription>
            {request.authoredByAgent
              ? `Written by ${vocab.agent}`
              : request.author
                ? `From ${request.author}`
                : 'Its source is not known'}
            {request.version ? ` · version ${request.version}` : ''}
          </DialogDescription>
        </DialogHeader>
        {open ? <PluginReviewBody request={request} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PluginReviewBody({ request }: { request: FlowTrustRequest }) {
  const repository = useRepository();
  const review = useQuery({
    queryKey: ['plugin-review', request.reviewUrl],
    queryFn: ({ signal }) => repository.pluginReview(request.reviewUrl, signal),
    enabled: Boolean(request.reviewUrl),
  });
  if (!request.reviewUrl) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        The server did not offer a review of this plugin.
      </p>
    );
  }
  if (review.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner aria-hidden="true" />
        Reading the plugin…
      </p>
    );
  }
  if (review.isError) {
    return (
      <div className="grid gap-2" role="alert">
        <p className="flex items-start gap-2 text-sm text-destructive">
          <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          The plugin&apos;s review could not be loaded, so it can&apos;t be checked here.
        </p>
        <TechnicalDetails className="text-xs text-muted-foreground" title="Technical details">
          <p className="break-words">{review.error.message}</p>
        </TechnicalDetails>
        <Button
          className="justify-self-start"
          onClick={() => void review.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          Try again
        </Button>
      </div>
    );
  }
  return <PluginReviewContent focus={request.flow} focusFile={request.file} plugin={review.data} />;
}

/** The review itself: description, diagrams and reach first; the code last. */
export function PluginReviewContent({
  plugin,
  focus,
  focusFile,
}: {
  plugin: PluginReview;
  focus?: string;
  /** The file the person opened the review from; its code is listed first. */
  focusFile?: string;
}) {
  // The flow this permission is about leads; the plugin's other flows follow.
  const flows = [...plugin.flows].sort(
    (left, right) => Number(right.id === focus) - Number(left.id === focus),
  );
  return (
    <div className="grid min-w-0 gap-5" data-slot="plugin-review">
      <p className="break-words text-sm">
        {plugin.description || 'This plugin does not describe itself.'}
      </p>
      {flows.length === 0 ? (
        <p className="text-sm text-muted-foreground">This plugin adds no flows.</p>
      ) : (
        <section aria-label="Its flows" className="grid min-w-0 gap-4">
          {flows.map((flow) => (
            <div className="grid min-w-0 gap-1.5" data-slot="plugin-review-flow" key={flow.id}>
              <div className="min-w-0">
                <h3 className="text-sm font-medium">Flow {flow.id}</h3>
                {flow.description ? (
                  <p className="break-words text-xs text-muted-foreground">{flow.description}</p>
                ) : null}
              </div>
              <PluginFlowShape label={flow.id} source={flow.shape} />
            </div>
          ))}
        </section>
      )}
      <PluginReach plugin={plugin} />
      <PluginCode focusFile={focusFile} plugin={plugin} />
    </div>
  );
}

function PluginReach({ plugin }: { plugin: PluginReview }) {
  const items: Array<{ key: string; Icon: LucideIcon; text: string }> = plugin.reach.map(
    (reach) => ({
      key: reach,
      Icon: REACH_ICONS[reach] ?? ShieldAlertIcon,
      text: pluginReachLabel(reach),
    }),
  );
  // Code that could not be read is code whose reach is unknown.
  if (plugin.unreadable.length > 0) {
    items.push({
      key: '$unreadable',
      Icon: FileWarningIcon,
      text: `Some of its files could not be read (${plugin.unreadable.join(', ')}), so what they do can't be read from the code`,
    });
  }
  return (
    <section aria-label="What it can reach" className="grid min-w-0 gap-1.5">
      <h3 className="text-sm font-medium">What it can reach</h3>
      {items.length === 0 ? (
        <p className="flex items-start gap-2 text-sm">
          <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          <span>
            Works only through {vocab.agent}&apos;s agents: it does not open files, use the network
            or run commands itself.
          </span>
        </p>
      ) : (
        <ul className="grid gap-1">
          {items.map(({ key, Icon, text }) => (
            <li className="flex items-start gap-2 text-sm text-warning" key={key}>
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-words">{text}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Read from its code.</p>
    </section>
  );
}

function PluginCode({ plugin, focusFile }: { plugin: PluginReview; focusFile?: string }) {
  const files = Object.entries(plugin.files).sort(
    ([left], [right]) => Number(right === focusFile) - Number(left === focusFile),
  );
  return (
    <TechnicalDetails
      className="text-xs"
      contentClassName="mt-2 grid min-w-0 gap-3"
      title="Show the code"
    >
      {files.length === 0 ? (
        <p className="text-muted-foreground">No code was included with this review.</p>
      ) : (
        files.map(([path, text]) => (
          <figure className="m-0 grid min-w-0 gap-1" key={path}>
            <figcaption className="break-all font-mono text-muted-foreground">{path}</figcaption>
            <pre className="clio-scrollbar max-h-72 overflow-auto whitespace-pre rounded-md bg-muted/60 p-2 font-mono text-xs">
              {text}
            </pre>
          </figure>
        ))
      )}
      {plugin.files_truncated ? (
        <p className="text-muted-foreground">
          The code is long, so only its beginning is shown here.
        </p>
      ) : null}
    </TechnicalDetails>
  );
}
