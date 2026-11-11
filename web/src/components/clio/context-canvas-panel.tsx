import type {
  ContextFile,
  ContextFrame,
  ContextFrameItem,
  ContextSnapshot,
  Message,
  WorkspaceResource,
  ToolInvocation,
} from '@clio/core/v3';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { referenceKindLabel } from '@/lib/composer-reference-domain';
import type { ClioContextTarget } from '@/lib/context-targets';
import { formatBytes } from '@/lib/format';
import { ContextCompactionControls } from './context-compaction-controls';
import { contextTokens } from './context-composition-model';
import { ContextDisclosure } from './context-disclosure';
import { ContextSources } from './context-sources';
import { humanizeProtocolValue } from './presentation-labels';
import { ContextUsage } from './context-usage';

interface ClioContextCanvasPanelProps {
  compact?: boolean;
  compactPending?: boolean;
  context?: ContextSnapshot;
  error?: string;
  files: readonly ContextFile[];
  frames: readonly ContextFrame[];
  messages?: readonly Message[];
  resources?: readonly WorkspaceResource[];
  tools?: readonly ToolInvocation[];
  onOpenResource?: (resource: WorkspaceResource) => void;
  onCompact?: () => Promise<unknown>;
  onOpenFile?: (path: string) => void;
  onTargetChange?: (targetId: string) => void;
  onUpdatePreferences?: (input: {
    automatic_compaction?: boolean;
    autocompact_pct?: number;
  }) => Promise<unknown>;
  preferencesPending?: boolean;
  selectedTargetId?: string;
  targets?: readonly ClioContextTarget[];
}

/** Last request usage first; named sections and source details expand in place. */
export function ClioContextCanvasPanel({
  compact = false,
  context,
  error,
  files,
  frames,
  messages = [],
  resources,
  tools,
  onOpenResource,
  onCompact,
  onOpenFile,
  onTargetChange,
  onUpdatePreferences,
  compactPending,
  preferencesPending,
  selectedTargetId,
  targets = [],
}: ClioContextCanvasPanelProps) {
  const latest = frames.at(-1);
  const selected = targets.find((target) => target.id === selectedTargetId);
  const agentLabel = selected?.label === 'main' ? 'Main agent' : (selected?.label ?? 'Main agent');
  return (
    <div className="grid min-w-0 gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Context unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {targets.length > 1 ? (
        <Select onValueChange={onTargetChange} value={selectedTargetId}>
          <SelectTrigger aria-label="Context agent" className="h-8 w-full text-xs">
            {agentLabel}
          </SelectTrigger>
          <SelectContent>
            {targets.map((target) => (
              <SelectItem key={target.id} value={target.id}>
                {target.label === 'main' ? 'Main agent' : target.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <ContextUsage context={context} messages={messages} compact={compact} />
      {!compact ? (
        <>
          <ContextSources
            key={`sources:${selectedTargetId}`}
            files={files}
            frame={latest}
            resources={resources}
            tools={tools}
            onOpenFile={onOpenFile}
            onOpenResource={onOpenResource}
          />
          <ContextDisclosure label="Latest context snapshot" count={latest?.items.length ?? 0}>
            {latest ? (
              <ul className="grid gap-2 text-xs">
                {latest.items.map((item, index) => {
                  const row = frameItemRow(item);
                  return (
                    <li key={index} className="min-w-0" title={row.title}>
                      {item.path && onOpenFile ? (
                        <button
                          className="break-words text-left hover:underline"
                          onClick={() => onOpenFile(item.path!)}
                        >
                          {row.name}
                        </button>
                      ) : (
                        <p className="break-words">{row.name}</p>
                      )}
                      {row.kind ? <p className="text-muted-foreground">{row.kind}</p> : null}
                      <p className="text-muted-foreground">{row.inclusion}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No context snapshot is available for this agent.
              </p>
            )}
          </ContextDisclosure>
          {context ? (
            <ContextCompactionControls
              key={`compaction:${selectedTargetId}`}
              context={context}
              compactPending={compactPending}
              preferencesPending={preferencesPending}
              onCompact={onCompact}
              onUpdatePreferences={onUpdatePreferences}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const REFERENCE_DELIVERY: Record<string, string> = {
  metadata: 'details only',
  summary: 'summary',
  workspace_path: 'path only',
};

/**
 * How a reference reached the model. Inline text is capped by the backend and
 * its estimate is `min(size, cap) / 4`, so an estimate short of the file's
 * size means only the start of the file was sent.
 */
function deliveryLabel(delivery: Record<string, unknown>, tokensEstimated: number): string {
  const mode = 'summary' in delivery ? 'summary' : text(delivery.mode);
  if (REFERENCE_DELIVERY[mode]) return `sent as ${REFERENCE_DELIVERY[mode]}`;
  if (mode === 'inline_text') {
    const size = typeof delivery.size_bytes === 'number' ? delivery.size_bytes : 0;
    return size > 0 && tokensEstimated * 4 + 4 < size ? 'sent in part' : 'sent in full';
  }
  return mode ? `sent as ${humanizeProtocolValue(mode).toLowerCase()}` : '';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * One snapshot row as a reader names it: what it is, what kind of thing, how
 * big, and whether it reached the model. `display_path` is newer than some
 * backends, so a reference falls back to its label, its workspace path and its
 * id before the protocol kind is ever shown.
 */
function frameItemRow(item: ContextFrameItem): {
  name: string;
  kind?: string;
  inclusion: string;
  title: string;
} {
  const amount = contextTokens(item.tokens_estimated);
  const tokens = `≈${amount} ${amount === '1' ? 'token' : 'tokens'}`;
  if (item.kind === 'context_ref') {
    const delivery = (item.metadata.delivery ?? {}) as Record<string, unknown>;
    const refKind = text(item.metadata.ref_kind);
    const name =
      text(item.display_path) ||
      text(item.metadata.label) ||
      text(delivery.workspace_path) ||
      text(item.source_id) ||
      capitalize(refKind ? referenceKindLabel(refKind) : 'reference');
    const size =
      typeof delivery.size_bytes === 'number' && delivery.size_bytes > 0
        ? formatBytes(delivery.size_bytes)
        : '';
    const kind = [
      capitalize(refKind ? referenceKindLabel(refKind) : 'reference'),
      size,
      deliveryLabel(delivery, item.tokens_estimated),
    ]
      .filter(Boolean)
      .join(', ');
    const inclusion = `${item.included ? 'Included' : 'Excluded'}, ${tokens}`;
    return { name, kind, inclusion, title: `${name}\n${kind}\n${inclusion}` };
  }
  const name =
    text(item.display_path) ||
    text(item.path) ||
    (item.role === 'user'
      ? 'User request'
      : item.role === 'assistant'
        ? 'Assistant response'
        : item.kind === 'injection' && item.source_id === 'memory'
          ? 'Memory'
          : humanizeProtocolValue(item.kind));
  const inclusion = [
    `${item.included ? 'Included' : 'Excluded'}, ${tokens}`,
    item.reason ? humanizeProtocolValue(item.reason) : '',
  ]
    .filter(Boolean)
    .join(', ');
  return { name, inclusion, title: `${name}\n${inclusion}` };
}
