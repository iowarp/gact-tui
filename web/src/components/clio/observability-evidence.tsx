import type {
  Artifact,
  ArtifactProvenanceProviderSummary,
  AsyncProcess,
  ContextFile,
  ExecutionProvenanceDegradation,
  Message,
  ProvenanceProviderSummary,
  SessionDiff,
  WorkspaceResource,
} from '@clio/core/v3';
import {
  BoxIcon,
  ExternalLinkIcon,
  FileDiffIcon,
  FileCode2Icon,
  FileTextIcon,
  ListTreeIcon,
  PanelsTopLeftIcon,
  WaypointsIcon,
} from 'lucide-react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/format';
import { ClioInteractiveRow } from './interactive-row';
import { ClioArtifactCard } from './artifact-card';
import { ClioStatus } from './status';

export interface ClioEvidenceViewProps {
  artifacts: readonly Artifact[];
  contextFiles: readonly ContextFile[];
  diffs: readonly SessionDiff[];
  messages: readonly Message[];
  processes: readonly AsyncProcess[];
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenDiff?: (diff: SessionDiff) => void;
  onOpenFile?: (path: string) => void;
  onOpenResource?: (resource: WorkspaceResource) => void;
  provenanceProvider?: ProvenanceProviderSummary;
  artifactProvenanceProvider?: ArtifactProvenanceProviderSummary;
  provenanceDegradation?: ExecutionProvenanceDegradation;
  resources?: readonly WorkspaceResource[];
}

export function ClioEvidenceView(props: ClioEvidenceViewProps) {
  const plans = props.messages.flatMap((message) =>
    message.blocks
      .filter((block) => block.type === 'plan')
      .map((block) => ({ ...block, messageId: message.id })),
  );
  const sources = sessionSources(props.messages, props.processes, props.resources ?? []);
  const hasEvidence =
    props.diffs.length ||
    props.artifacts.length ||
    sources.length ||
    plans.length ||
    props.contextFiles.length;
  const hasProvenance = Boolean(
    props.provenanceProvider || props.artifactProvenanceProvider || props.provenanceDegradation,
  );

  if (!hasEvidence && !hasProvenance) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No changed files, sources, artifacts, plans, or attached context are available.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {hasProvenance ? (
        <Frame spacing="sm" variant="ghost">
          <FrameHeader>
            <FrameTitle>Evidence custody</FrameTitle>
            <FrameDescription>
              Provenance availability reported by the connected service.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="flex flex-wrap gap-2">
            {props.provenanceProvider ? (
              <ClioStatus
                label={`Execution: ${props.provenanceProvider.name}`}
                detail={props.provenanceProvider.status}
                value={evidenceProviderStatus(
                  props.provenanceProvider.status,
                  props.provenanceProvider.queryable,
                )}
              />
            ) : null}
            {props.artifactProvenanceProvider ? (
              <ClioStatus
                label={`Artifacts: ${props.artifactProvenanceProvider.provider}`}
                detail={props.artifactProvenanceProvider.status}
                value={evidenceProviderStatus(
                  props.artifactProvenanceProvider.status,
                  props.artifactProvenanceProvider.queryable,
                )}
              />
            ) : null}
            {props.provenanceDegradation ? (
              <p className="basis-full text-xs leading-5 text-muted-foreground">
                {props.provenanceDegradation.reason}
              </p>
            ) : null}
          </FramePanel>
        </Frame>
      ) : null}
      <EvidenceCounts
        artifacts={props.artifacts.length}
        contextFiles={props.contextFiles.length}
        diffs={props.diffs.length}
        plans={plans.length}
        sources={sources.length}
      />
      <Accordion defaultValue={['changes', 'sources']} type="multiple">
        <EvidenceSection
          icon={FileDiffIcon}
          label="Changed files"
          value="changes"
          count={props.diffs.length}
        >
          <DiffEvidence
            diffs={props.diffs}
            onOpenDiff={props.onOpenDiff}
            onOpenFile={props.onOpenFile}
          />
        </EvidenceSection>
        <EvidenceSection
          icon={WaypointsIcon}
          label="Sources"
          value="sources"
          count={sources.length}
        >
          <SourceEvidence onOpenResource={props.onOpenResource} sources={sources} />
        </EvidenceSection>
        <EvidenceSection
          icon={BoxIcon}
          label="Artifacts"
          value="artifacts"
          count={props.artifacts.length}
        >
          <ArtifactEvidence artifacts={props.artifacts} onOpenArtifact={props.onOpenArtifact} />
        </EvidenceSection>
        <EvidenceSection icon={ListTreeIcon} label="Plans" value="plans" count={plans.length}>
          {plans.length ? (
            <div className="grid gap-2">
              {plans.map((plan) => (
                <ClioInteractiveRow key={`${plan.messageId}:${plan.id}`}>
                  <p className="text-sm font-medium">{plan.title}</p>
                  {plan.detail ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{plan.detail}</p>
                  ) : null}
                </ClioInteractiveRow>
              ))}
            </div>
          ) : (
            <EmptyEvidence label="No plan blocks were recorded." />
          )}
        </EvidenceSection>
        <EvidenceSection
          icon={FileTextIcon}
          label="Attached context"
          value="context"
          count={props.contextFiles.length}
        >
          <ContextFileEvidence files={props.contextFiles} onOpenFile={props.onOpenFile} />
        </EvidenceSection>
      </Accordion>
    </div>
  );
}

function evidenceProviderStatus(
  status: string,
  queryable: boolean,
): 'healthy' | 'degraded' | 'unavailable' {
  if (!queryable || status === 'unavailable' || status === 'disabled') return 'unavailable';
  if (status === 'degraded' || status === 'partial') return 'degraded';
  return 'healthy';
}

function EvidenceSection({
  icon: Icon,
  label,
  value,
  count,
  children,
}: {
  icon: typeof FileDiffIcon;
  label: string;
  value: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {label}
          <Badge variant="secondary">{count}</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent className="grid gap-2">{children}</AccordionContent>
    </AccordionItem>
  );
}

function DiffEvidence({
  diffs,
  onOpenDiff,
  onOpenFile,
}: {
  diffs: readonly SessionDiff[];
  onOpenDiff?: (diff: SessionDiff) => void;
  onOpenFile?: (path: string) => void;
}) {
  if (!diffs.length) return <EmptyEvidence label="No file changes were recorded." />;
  return diffs.map((diff) => (
    <CodeBlock
      code={diff.unified_diff || 'Diff content unavailable.'}
      key={diff.path}
      language="diff"
    >
      <CodeBlockHeader>
        <CodeBlockTitle>
          <FileDiffIcon aria-hidden="true" className="size-3.5" />
          <CodeBlockFilename>{diff.path}</CodeBlockFilename>
          <ClioStatus label={friendlyStatus(diff.status)} value={diffStatus(diff)} />
        </CodeBlockTitle>
        <CodeBlockActions>
          {onOpenDiff ? (
            <Button
              aria-label={`Review diff for ${diff.path} in canvas`}
              onClick={() => onOpenDiff(diff)}
              size="icon-xs"
              title="Open review tab"
              variant="ghost"
            >
              <PanelsTopLeftIcon aria-hidden="true" />
            </Button>
          ) : null}
          {onOpenFile ? (
            <Button
              aria-label={`Open current ${diff.path} in workspace`}
              onClick={() => onOpenFile(diff.path)}
              size="icon-xs"
              title="Open current file"
              variant="ghost"
            >
              <FileCode2Icon aria-hidden="true" />
            </Button>
          ) : null}
          {diff.unified_diff ? (
            <CodeBlockCopyButton aria-label={`Copy diff for ${diff.path}`} />
          ) : null}
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  ));
}

/** One labelled fact rendered as its own sibling element — never middot-joined into a string. */
interface EvidenceSourceDetailPart {
  id: string;
  text: string;
  title?: string;
}

interface EvidenceSource {
  id: string;
  label: string;
  link: boolean;
  /** The link href for a citation, or the raw value for a workflow-derived source. */
  value?: string;
  /** Structured detail for a resource source, rendered as separate spans. */
  detailParts?: readonly EvidenceSourceDetailPart[];
  /** Identity used to collapse duplicates — never the rendered text, so a formatting change
   *  can't change what dedups. */
  dedupeKey: string;
  resource?: WorkspaceResource;
}

function SourceEvidence({
  sources,
  onOpenResource,
}: {
  sources: readonly EvidenceSource[];
  onOpenResource?: (resource: WorkspaceResource) => void;
}) {
  if (!sources.length) return <EmptyEvidence label="No source references were recorded." />;
  return (
    <div className="grid gap-2">
      {sources.map((source) => (
        <ClioInteractiveRow
          aria-label={source.resource && onOpenResource ? `Open source ${source.label}` : undefined}
          className={source.resource && onOpenResource ? 'cursor-pointer' : undefined}
          key={source.id}
          onClick={
            source.resource && onOpenResource
              ? () => onOpenResource(source.resource as WorkspaceResource)
              : undefined
          }
          role={source.resource && onOpenResource ? 'button' : undefined}
          tabIndex={source.resource && onOpenResource ? 0 : undefined}
        >
          <div className="flex items-start gap-3">
            <WaypointsIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{source.label}</p>
              {source.link && source.value ? (
                <a
                  aria-label={`${source.label}: ${source.value}`}
                  className="mt-1 flex items-center gap-1 break-all text-xs text-primary hover:underline"
                  href={source.value}
                  rel="noreferrer"
                  target="_blank"
                >
                  {source.value}
                  <ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
                </a>
              ) : source.detailParts ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {source.detailParts.map((part) => (
                    <span key={part.id} title={part.title}>
                      {part.text}
                    </span>
                  ))}
                </div>
              ) : (
                <p
                  className="mt-1 break-all text-xs text-muted-foreground"
                  title={
                    source.value === undefined || sourceDisplayValue(source.value) === source.value
                      ? undefined
                      : source.value
                  }
                >
                  {source.value === undefined ? '' : sourceDisplayValue(source.value)}
                </p>
              )}
            </div>
          </div>
        </ClioInteractiveRow>
      ))}
    </div>
  );
}

function ArtifactEvidence({
  artifacts,
  onOpenArtifact,
}: {
  artifacts: readonly Artifact[];
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  if (!artifacts.length) return <EmptyEvidence label="No artifacts were produced." />;
  return (
    <div className="grid gap-2">
      {artifacts.map((artifact) => (
        <ClioArtifactCard artifact={artifact} key={artifact.id} onOpen={onOpenArtifact} />
      ))}
    </div>
  );
}

function ContextFileEvidence({
  files,
  onOpenFile,
}: {
  files: readonly ContextFile[];
  onOpenFile?: (path: string) => void;
}) {
  if (!files.length)
    return <EmptyEvidence label="No files are attached to this session context." />;
  return (
    <div className="grid gap-2">
      {files.map((file) => (
        <ClioInteractiveRow
          className={onOpenFile ? 'cursor-pointer' : undefined}
          key={file.path}
          onClick={() => onOpenFile?.(file.path)}
          role={onOpenFile ? 'button' : undefined}
          tabIndex={onOpenFile ? 0 : undefined}
        >
          <div className="flex items-center gap-3">
            <FileTextIcon aria-hidden="true" className="size-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.display_path}</p>
              <p className="text-xs text-muted-foreground">
                {friendlyStatus(file.mode)}
                {file.size === undefined ? '' : `, ${formatBytes(file.size)}`}
              </p>
            </div>
          </div>
        </ClioInteractiveRow>
      ))}
    </div>
  );
}

function EvidenceCounts(props: {
  artifacts: number;
  contextFiles: number;
  diffs: number;
  plans: number;
  sources: number;
}) {
  return (
    <Frame spacing="xs" variant="ghost">
      <FrameHeader>
        <FrameTitle>Session evidence</FrameTitle>
        <FrameDescription>
          Authoritative references grouped by what they let you inspect.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="grid grid-cols-5 gap-2 text-center">
        {[
          ['Artifacts', props.artifacts],
          ['Context files', props.contextFiles],
          ['Diffs', props.diffs],
          ['Plans', props.plans],
          ['Sources', props.sources],
        ].map(([label, count]) => (
          <div key={label}>
            <p className="text-base font-semibold">{count}</p>
            <p className="truncate text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </FramePanel>
    </Frame>
  );
}

function sessionSources(
  messages: readonly Message[],
  processes: readonly AsyncProcess[],
  resources: readonly WorkspaceResource[],
): EvidenceSource[] {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const sources: EvidenceSource[] = messages.flatMap((message) =>
    message.blocks.flatMap((block): EvidenceSource[] => {
      if (block.type === 'citation') {
        return [
          {
            id: `citation:${message.id}:${block.id}`,
            label: block.label,
            value: block.uri,
            link: isWebLink(block.uri),
            dedupeKey: `citation:${block.uri}`,
          },
        ];
      }
      if (block.type !== 'resource') return [];
      const resource = resourcesById.get(block.resource_id);
      return [
        {
          id: `resource:${block.workspace_id}:${block.resource_id}:${block.resource_revision}`,
          label: resource?.name ?? block.name,
          link: false,
          detailParts: resourceEvidenceDetail(resource, block.media_type, block.resource_revision),
          // Keyed on resource identity, never the rendered string: two distinct resources can
          // render identical detail text, and a formatting change must not change what collapses.
          dedupeKey: `resource:${block.resource_id}:${block.resource_revision}`,
          resource,
        },
      ];
    }),
  );
  for (const process of processes) {
    collectWorkflowSources(process.result?.workflow_state, process.title, sources);
  }
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.dedupeKey)) return false;
    seen.add(source.dedupeKey);
    return true;
  });
}

/**
 * Builds the resource detail parts for one source, favoring what was actually DELIVERED
 * (the message block's own media type and revision) over the live workspace resource, which
 * may have since changed. The live resource only fills in fields the block never carries
 * (size, SHA-256) and, when its revision has moved on, that is called out explicitly rather
 * than silently replacing the delivered revision.
 */
function resourceEvidenceDetail(
  resource: WorkspaceResource | undefined,
  deliveredMediaType: string,
  deliveredRevision: string,
): EvidenceSourceDetailPart[] {
  const mediaType = deliveredMediaType || resource?.detected_mime || resource?.claimed_mime;
  const parts: EvidenceSourceDetailPart[] = [
    { id: 'type', text: mediaType || 'Unknown type' },
    { id: 'revision', text: `Revision ${deliveredRevision}` },
  ];
  if (resource && String(resource.revision) !== deliveredRevision) {
    parts.push({
      id: 'current-revision',
      text: `Current revision ${resource.revision}`,
      title:
        'The workspace resource has since changed; this reference delivered an earlier revision to the model.',
    });
  }
  if (resource?.received_size !== undefined) {
    parts.push({ id: 'size', text: formatBytes(resource.received_size) });
  }
  if (resource?.sha256) {
    parts.push({ id: 'sha', text: `SHA-256 ${resource.sha256.slice(0, 12)}…` });
  }
  return parts;
}

function collectWorkflowSources(
  value: unknown,
  owner: string,
  sources: EvidenceSource[],
  path: string[] = [],
  depth = 0,
) {
  if (!value || depth > 5) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectWorkflowSources(item, owner, sources, [...path, String(index)], depth + 1),
    );
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = [...path, key];
    if (
      typeof child === 'string' &&
      child.length <= 2_048 &&
      (isWebLink(child) || /(?:^|_)(?:source|provenance)(?:_url)?$/iu.test(key))
    ) {
      sources.push({
        id: `workflow:${owner}:${nextPath.join('.')}:${sources.length}`,
        label: `${owner}, ${evidenceFieldLabel(key)}`,
        value: child,
        link: isWebLink(child),
        dedupeKey: `workflow:${child}`,
      });
    } else {
      collectWorkflowSources(child, owner, sources, nextPath, depth + 1);
    }
  }
}

function diffStatus(diff: SessionDiff): 'pending' | 'succeeded' | 'cancelled' | 'unavailable' {
  if (diff.applied || diff.status === 'applied') return 'succeeded';
  if (diff.status === 'rejected') return 'cancelled';
  if (diff.status === 'pending') return 'pending';
  return 'unavailable';
}

function friendlyStatus(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function evidenceFieldLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim()
    .split(/\s+/u)
    .map((word, index) => {
      if (word.toLowerCase() === 'url') return 'URL';
      const normalized = word.toLowerCase();
      return index === 0 ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : normalized;
    })
    .join(' ');
}

function sourceDisplayValue(value: string): string {
  if (value.toLowerCase() === 'osm_nominatim') return 'OpenStreetMap Nominatim';
  return value;
}

function isWebLink(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function EmptyEvidence({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">{label}</p>
  );
}
