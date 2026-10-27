import type {
  ContextFile,
  ContextFrame,
  ContextSnapshot,
  Message,
  WorkspaceResource,
  ToolInvocation,
} from '@clio/core/v3';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { ClioContextTarget } from '@/lib/context-targets';
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
                {latest.items.map((item, index) => (
                  <li key={index} className="min-w-0">
                    {item.path && onOpenFile ? (
                      <button
                        className="break-words text-left hover:underline"
                        onClick={() => onOpenFile(item.path!)}
                      >
                        {item.display_path ?? item.path}
                      </button>
                    ) : (
                      <p>
                        {item.role === 'user'
                          ? 'User request'
                          : item.role === 'assistant'
                            ? 'Assistant response'
                            : item.kind === 'injection' && item.source_id === 'memory'
                              ? 'Memory'
                              : humanizeProtocolValue(item.kind)}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {item.included ? 'Included' : 'Excluded'}, ≈
                      {contextTokens(item.tokens_estimated)} tokens
                      {item.reason ? `, ${humanizeProtocolValue(item.reason)}` : ''}
                    </p>
                  </li>
                ))}
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
