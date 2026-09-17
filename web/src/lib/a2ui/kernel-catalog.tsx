import {
  CommonSchemas,
  BASIC_FUNCTIONS,
  ImageApi,
  VideoApi,
  AudioPlayerApi,
  createFunctionImplementation,
} from '@a2ui/web_core/v0_9';
import type { FunctionImplementation } from '@a2ui/web_core/v0_9';
import {
  A2UI_WORKFLOW_EDGES_MAX,
  A2UI_WORKFLOW_NODES_MAX,
  checkA2uiUrlScheme,
} from '@clio/core/v3';
import {
  A2uiSurface,
  Button as A2UIButton,
  CheckBox,
  ChoicePicker,
  Column,
  DateTimeInput,
  Card,
  Divider,
  Icon,
  List,
  Modal,
  Row,
  Slider,
  Tabs,
  Text,
  TextField,
  createComponentImplementation,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9';
import { GitCompareArrowsIcon, ImageOffIcon, ShieldAlertIcon } from 'lucide-react';
import { lazy, Suspense, type CSSProperties } from 'react';
import { z } from 'zod';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
import {
  Frame as ReUIFrame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { truncate } from '@/lib/format';
import { DIAGRAM_LABEL_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import {
  a2uiAccessibilityDescription,
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from '@/components/clio/a2ui-accessibility';
import { ClioDataTable, type ClioDataColumn, type ClioDataRow } from '@/components/clio/data-table';
import { ClioArtifactCatalogComponent } from '@/components/clio/a2ui-artifact';
import { ClioMapCatalogComponent } from '@/components/clio/a2ui-map';
import { ClioTimeSeriesCatalogComponent } from '@/components/clio/a2ui-time-series-catalog';
import { ClioMermaidDiagram } from '@/components/clio/mermaid-diagram';
import { ClioStatus, type ClioStatusProps } from '@/components/clio/status';
import { activeA2uiOpenArtifactRuntime } from './kernel-runtime';
import { useA2uiUrlGuard } from './url-guard';

const ClioA2UICodeView = lazy(() =>
  import('@/components/clio/a2ui-code-view').then((module) => ({
    default: module.ClioA2UICodeView,
  })),
);

const accessibility = CommonSchemas.AccessibilityAttributes.optional();
const weight = z.number().optional();

const statusValues = new Set<ClioStatusProps['value']>([
  'connecting',
  'live',
  'reconnecting',
  'gapped',
  'offline',
  'queued',
  'running',
  'waiting_permission',
  'waiting_user',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
  'pending',
  'succeeded',
  'denied',
  'healthy',
  'degraded',
  'unavailable',
]);

function a2uiStatusValue(value: string): ClioStatusProps['value'] {
  return statusValues.has(value as ClioStatusProps['value'])
    ? (value as ClioStatusProps['value'])
    : 'unavailable';
}

/**
 * Renders in place of a kernel media component whose resolved URL failed the
 * scheme allowlist (owner decision 11). The failure is local to this one
 * component — the rest of the surface keeps rendering.
 */
function UrlBlocked({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      role="alert"
    >
      <ImageOffIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

const Grid = createComponentImplementation(
  {
    name: 'Grid',
    schema: z
      .object({
        children: z.array(z.string()),
        columns: z.number().int().min(1).max(12).optional(),
        gap: z.number().min(0).max(12).optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props, buildChild }) => (
    <div
      {...a2uiAccessibilityProps(props.accessibility)}
      className="grid gap-3"
      role="group"
      style={{ gridTemplateColumns: `repeat(${props.columns ?? 2}, minmax(0, 1fr))` }}
    >
      {props.children.map((child: string) => (
        <div key={child}>{buildChild(child)}</div>
      ))}
    </div>
  ),
);

const Frame = createComponentImplementation(
  {
    name: 'Frame',
    schema: z
      .object({
        child: z.string(),
        title: CommonSchemas.DynamicString.optional(),
        description: CommonSchemas.DynamicString.optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props, buildChild }) => (
    <ReUIFrame {...a2uiAccessibilityProps(props.accessibility)} role="group" spacing="sm">
      {props.title || props.description ? (
        <FrameHeader>
          {props.title ? <FrameTitle>{props.title}</FrameTitle> : null}
          {props.description ? <FrameDescription>{props.description}</FrameDescription> : null}
        </FrameHeader>
      ) : null}
      <FramePanel>{buildChild(props.child)}</FramePanel>
    </ReUIFrame>
  ),
);

const Status = createComponentImplementation(
  {
    name: 'clio.status.v1',
    schema: z
      .object({
        label: CommonSchemas.DynamicString,
        state: CommonSchemas.DynamicString,
        detail: CommonSchemas.DynamicString.optional(),
        elapsedMs: CommonSchemas.DynamicNumber.optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props }) => (
    <ReUIFrame {...a2uiAccessibilityProps(props.accessibility)} dense role="group" spacing="sm">
      <FramePanel className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{props.label}</span>
        <ClioStatus
          detail={props.detail}
          label={props.state.replaceAll('_', ' ')}
          value={a2uiStatusValue(props.state)}
        />
        {props.elapsedMs !== undefined ? (
          <span className="font-mono text-xs text-muted-foreground">
            {Math.round(props.elapsedMs / 1000)}s
          </span>
        ) : null}
      </FramePanel>
    </ReUIFrame>
  ),
);

const Metric = createComponentImplementation(
  {
    name: 'clio.metric.v1',
    schema: z
      .object({
        label: CommonSchemas.DynamicString,
        value: CommonSchemas.DynamicValue,
        unit: CommonSchemas.DynamicString.optional(),
        trend: CommonSchemas.DynamicString.optional(),
        detail: CommonSchemas.DynamicString.optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props }) => (
    <ReUIFrame {...a2uiAccessibilityProps(props.accessibility)} dense role="group" spacing="sm">
      <FramePanel>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{props.label}</p>
        <p className="mt-2 font-mono text-2xl font-semibold">
          {String(props.value)}
          {props.unit ? (
            <span className="ml-1 text-sm text-muted-foreground">{props.unit}</span>
          ) : null}
        </p>
        {props.trend || props.detail ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {[props.trend, props.detail].filter(Boolean).join(', ')}
          </p>
        ) : null}
      </FramePanel>
    </ReUIFrame>
  ),
);

const ClioProgress = createComponentImplementation(
  {
    name: 'clio.progress.v1',
    schema: z
      .object({
        label: CommonSchemas.DynamicString,
        value: CommonSchemas.DynamicNumber.optional(),
        max: CommonSchemas.DynamicNumber.optional(),
        state: CommonSchemas.DynamicString.optional(),
        detail: CommonSchemas.DynamicString.optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props }) => {
    const determinate = props.value !== undefined && props.max !== undefined && props.max > 0;
    const state = props.state ?? 'running';
    return (
      <ReUIFrame {...a2uiAccessibilityProps(props.accessibility)} dense role="group" spacing="sm">
        <FramePanel>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{props.label}</span>
            <ClioStatus label={state.replaceAll('_', ' ')} value={a2uiStatusValue(state)} />
          </div>
          {determinate ? (
            <Progress
              aria-label={props.label}
              value={Math.min(100, Math.max(0, (props.value! / props.max!) * 100))}
            />
          ) : (
            <div
              aria-label={`${props.label} indeterminate`}
              className="clio-activity-beam h-1.5 overflow-hidden rounded-full bg-muted"
            />
          )}
          {props.detail ? (
            <p className="mt-2 text-xs text-muted-foreground">{props.detail}</p>
          ) : null}
        </FramePanel>
      </ReUIFrame>
    );
  },
);

const Callout = createComponentImplementation(
  {
    name: 'clio.callout.v1',
    schema: z
      .object({
        title: CommonSchemas.DynamicString,
        body: CommonSchemas.DynamicString,
        severity: z.string(),
        action: CommonSchemas.Action.optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props }) => (
    <Alert
      {...a2uiAccessibilityProps(props.accessibility)}
      variant={props.severity === 'critical' ? 'destructive' : 'default'}
    >
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription>{props.body}</AlertDescription>
      {props.action ? (
        <Button className="mt-3" onClick={() => void props.action?.()} size="sm">
          Respond
        </Button>
      ) : null}
    </Alert>
  ),
);

const DataTable = createComponentImplementation(
  {
    name: 'clio.data-table.v1',
    schema: z
      .object({
        columns: z.array(
          z.union([z.string(), z.object({ key: z.string(), label: z.string() }).strict()]),
        ),
        rows: z.array(z.record(z.unknown())),
        selection: z.string().optional(),
        action: CommonSchemas.Action.optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props }) => (
    <ClioDataTable
      columns={props.columns as ClioDataColumn[]}
      description={a2uiAccessibilityDescription(props.accessibility)}
      label={a2uiAccessibilityLabel(props.accessibility)}
      onRowClick={props.action ? () => void props.action?.() : undefined}
      rows={props.rows as ClioDataRow[]}
    />
  ),
);

const Mermaid = createComponentImplementation(
  {
    name: 'clio.mermaid.v1',
    schema: z
      .object({
        source: CommonSchemas.DynamicString,
        title: CommonSchemas.DynamicString.optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props }) => (
    <ClioMermaidDiagram
      accessibilityDescription={a2uiAccessibilityDescription(props.accessibility)}
      accessibilityLabel={a2uiAccessibilityLabel(props.accessibility)}
      source={props.source}
      title={props.title}
    />
  ),
);

const workflowNode = z
  .object({
    id: z.string(),
    label: z.string(),
    state: z.string().optional(),
    detail: z.string().optional(),
  })
  .strict();
const workflowEdge = z
  .object({ source: z.string(), target: z.string(), label: z.string().optional() })
  .strict();

function mermaidLabel(value: string): string {
  const line = value
    .replace(/["<>\r\n]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return truncate(line, DIAGRAM_LABEL_TRUNCATE_CHARS);
}

function workflowSource(
  nodes: Array<z.infer<typeof workflowNode>>,
  edges: Array<z.infer<typeof workflowEdge>>,
  selected?: string,
): string {
  const identifiers = new Map(nodes.map((node, index) => [node.id, `node${index}`]));
  const lines = ['flowchart LR'];
  for (const node of nodes) {
    const id = identifiers.get(node.id)!;
    const state = node.state ? `, ${node.state.replaceAll('_', ' ')}` : '';
    lines.push(`  ${id}["${mermaidLabel(node.label + state)}"]`);
  }
  for (const edge of edges) {
    const source = identifiers.get(edge.source);
    const target = identifiers.get(edge.target);
    if (!source || !target) continue;
    lines.push(
      edge.label
        ? `  ${source} -->|${mermaidLabel(edge.label)}| ${target}`
        : `  ${source} --> ${target}`,
    );
  }
  const selectedId = selected ? identifiers.get(selected) : undefined;
  if (selectedId) {
    lines.push('  classDef selected fill:#2d2418,stroke:#f39a55,stroke-width:3px');
    lines.push(`  class ${selectedId} selected`);
  }
  return lines.join('\n');
}

const Workflow = createComponentImplementation(
  {
    name: 'clio.workflow.v1',
    schema: z
      .object({
        nodes: z.array(workflowNode).min(1).max(A2UI_WORKFLOW_NODES_MAX),
        edges: z.array(workflowEdge).max(A2UI_WORKFLOW_EDGES_MAX),
        selected: z.string().optional(),
        action: CommonSchemas.Action.optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props }) => (
    <div {...a2uiAccessibilityProps(props.accessibility)} className="grid gap-2" role="group">
      <ClioMermaidDiagram
        accessibilityDescription={a2uiAccessibilityDescription(props.accessibility)}
        accessibilityLabel={a2uiAccessibilityLabel(props.accessibility)}
        source={workflowSource(props.nodes, props.edges, props.selected)}
        title="Workflow"
      />
      {props.action && props.selected ? (
        <Button
          className="justify-self-start"
          onClick={() => void props.action?.()}
          size="sm"
          variant="outline"
        >
          Focus {props.nodes.find((node) => node.id === props.selected)?.label ?? 'selected step'}
        </Button>
      ) : null}
    </div>
  ),
);

function RenderedCode({
  accessibility: componentAccessibility,
  code,
  language,
  title,
}: {
  accessibility?: A2UIAccessibility;
  code: string;
  language: string;
  title?: string;
}) {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-muted" />}>
      <ClioA2UICodeView
        accessibility={componentAccessibility}
        code={code}
        language={language}
        title={title}
      />
    </Suspense>
  );
}

const Code = createComponentImplementation(
  {
    name: 'clio.code.v1',
    schema: z
      .object({
        code: CommonSchemas.DynamicString,
        language: z.string(),
        title: CommonSchemas.DynamicString.optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props }) => (
    <RenderedCode
      accessibility={props.accessibility}
      code={props.code}
      language={props.language}
      title={props.title}
    />
  ),
);

const Diff = createComponentImplementation(
  {
    name: 'clio.diff.v1',
    schema: z
      .object({
        path: z.string(),
        diff: CommonSchemas.DynamicString,
        status: CommonSchemas.DynamicString.optional(),
        action: CommonSchemas.Action.optional(),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props }) => (
    <div {...a2uiAccessibilityProps(props.accessibility)} className="grid gap-2" role="group">
      <RenderedCode
        accessibility={props.accessibility}
        code={props.diff}
        language="diff"
        title={props.path}
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitCompareArrowsIcon aria-hidden="true" className="size-3.5" />
        <span>{props.status || 'Proposed change'}</span>
        {props.action ? (
          <Button
            className="ml-auto"
            onClick={() => void props.action?.()}
            size="sm"
            variant="outline"
          >
            Open diff
          </Button>
        ) : null}
      </div>
    </div>
  ),
);

const cardAction = z
  .object({
    label: z.string(),
    action: CommonSchemas.Action,
    tone: z.enum(['default', 'destructive']).optional(),
  })
  .strict();

const ActionCard = createComponentImplementation(
  {
    name: 'clio.action-card.v1',
    schema: z
      .object({
        title: CommonSchemas.DynamicString,
        body: CommonSchemas.DynamicString,
        severity: z.string(),
        actions: z.array(cardAction).max(6),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props, context }) => (
    <Alert
      {...a2uiAccessibilityProps(props.accessibility)}
      variant={props.severity === 'critical' ? 'destructive' : 'default'}
    >
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription>{props.body}</AlertDescription>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.actions.map((item) => (
          <Button
            key={item.label}
            onClick={() => void context.dispatchAction(item.action)}
            size="sm"
            variant={item.tone === 'destructive' ? 'destructive' : 'outline'}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </Alert>
  ),
);

const Approval = createComponentImplementation(
  {
    name: 'clio.approval.v1',
    schema: z
      .object({
        title: CommonSchemas.DynamicString,
        reason: CommonSchemas.DynamicString,
        risk: CommonSchemas.DynamicString,
        actions: z.array(cardAction).min(1).max(4),
        accessibility,
        weight,
      })
      .strict(),
  },
  ({ props, context }) => (
    <div {...a2uiAccessibilityProps(props.accessibility)} role="group">
      <Confirmation approval={{ id: props.title }} state="approval-requested">
        <ShieldAlertIcon aria-hidden="true" className="size-4 text-warning" />
        <ConfirmationTitle>
          <span className="font-medium">{props.title}</span>
          <span className="mt-1 block text-sm text-muted-foreground">{props.reason}</span>
          <span className="mt-2 block text-xs">Risk: {props.risk}</span>
        </ConfirmationTitle>
        <ConfirmationRequest>
          <ConfirmationActions>
            {props.actions.map((item) => (
              <ConfirmationAction
                key={item.label}
                onClick={() => void context.dispatchAction(item.action)}
                variant={item.tone === 'destructive' ? 'destructive' : 'outline'}
              >
                {item.label}
              </ConfirmationAction>
            ))}
          </ConfirmationActions>
        </ConfirmationRequest>
      </Confirmation>
    </div>
  ),
);

// --- Guarded media kernel components (owner decision 11) -----------------
// Image/Video/AudioPlayer reuse the OFFICIAL basic-catalog schemas
// (`@a2ui/web_core`'s `ImageApi`/`VideoApi`/`AudioPlayerApi`) so bound props
// resolve identically to the library's own components; only the render is
// CLIO's, so a resolved URL can be checked before anything is mounted.

const IMAGE_OBJECT_FIT: Record<string, NonNullable<CSSProperties['objectFit']>> = {
  contain: 'contain',
  cover: 'cover',
  fill: 'fill',
  none: 'none',
  scaleDown: 'scale-down',
};

const Image = createComponentImplementation(ImageApi, ({ props, context }) => {
  const guard = useA2uiUrlGuard(context.componentModel.id, 'url', props.url);
  if (!guard.ok) return <UrlBlocked message={guard.message} />;
  return (
    <img
      alt={props.description ?? ''}
      className="max-w-full rounded-md"
      src={props.url}
      style={{ objectFit: IMAGE_OBJECT_FIT[props.fit ?? 'cover'] }}
    />
  );
});

const Video = createComponentImplementation(VideoApi, ({ props, context }) => {
  const guard = useA2uiUrlGuard(context.componentModel.id, 'url', props.url);
  if (!guard.ok) return <UrlBlocked message={guard.message} />;
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- protocol carries no caption track
    <video
      aria-label={a2uiAccessibilityLabel(props.accessibility)}
      className="w-full rounded-md"
      controls
      src={props.url}
    />
  );
});

const AudioPlayer = createComponentImplementation(AudioPlayerApi, ({ props, context }) => {
  const guard = useA2uiUrlGuard(context.componentModel.id, 'url', props.url);
  if (!guard.ok) return <UrlBlocked message={guard.message} />;
  return <audio aria-label={props.description} className="w-full" controls src={props.url} />;
});

// --- Kernel maps ------------------------------------------------------------

const KERNEL_COMPONENT_LIST: ReactComponentImplementation[] = [
  Text,
  Image,
  Icon,
  Video,
  AudioPlayer,
  Row,
  Column,
  List,
  Card,
  Tabs,
  Modal,
  Divider,
  A2UIButton,
  TextField,
  CheckBox,
  ChoicePicker,
  Slider,
  DateTimeInput,
  Grid,
  Frame,
  Status,
  Metric,
  ClioProgress,
  Callout,
  DataTable,
  ClioTimeSeriesCatalogComponent,
  Mermaid,
  ClioMapCatalogComponent,
  Workflow,
  ClioArtifactCatalogComponent,
  Code,
  Diff,
  ActionCard,
  Approval,
];

/** Every kernel component implementation this renderer has, keyed by its own name. */
export const KERNEL_COMPONENTS: ReadonlyMap<string, ReactComponentImplementation> = new Map(
  KERNEL_COMPONENT_LIST.map((component) => [component.name, component]),
);

const openArtifactFunction = createFunctionImplementation(
  {
    name: 'openArtifact',
    returnType: 'void',
    schema: z.object({ uri: z.string() }),
  },
  ({ uri }, context) => {
    // owner decision 11: the same URL-scheme allowlist the kernel media
    // components enforce at render, applied here before anything opens.
    const guard = checkA2uiUrlScheme(uri);
    if (!guard.ok) {
      void context.surface.dispatchError({ code: 'ARTIFACT_UNAVAILABLE', message: guard.reason });
      return;
    }
    const runtime = activeA2uiOpenArtifactRuntime();
    const artifact = runtime?.findArtifact(uri);
    if (!runtime || !artifact) {
      void context.surface.dispatchError({
        code: 'ARTIFACT_UNAVAILABLE',
        message: 'The requested artifact is not available in this session.',
      });
      return;
    }
    runtime.onOpenArtifact(artifact);
  },
);

const selectDataFunction = createFunctionImplementation(
  {
    name: 'selectData',
    returnType: 'void',
    schema: z.object({ rowIds: z.array(z.string()), surfaceId: z.string().optional() }),
  },
  () => {
    // No workspace-level row-selection state exists to update yet; the
    // function still resolves locally and never reaches the server, which is
    // the feature this replaces (`data.select` used to be a LOCAL_ACTIONS
    // no-op too — see docs/design/a2ui-compat-campaign-2026-09.md S6).
  },
);

const focusWorkflowFunction = createFunctionImplementation(
  {
    name: 'focusWorkflow',
    returnType: 'void',
    schema: z.object({ stepId: z.string() }),
  },
  () => {
    // Highlighting is driven by the bound `selected` data-model path today
    // (see the `Workflow` component above); this function resolves locally,
    // matching the old `workflow.focus` local action's scope.
  },
);

const KERNEL_FUNCTION_LIST: FunctionImplementation[] = [
  ...BASIC_FUNCTIONS,
  openArtifactFunction,
  selectDataFunction,
  focusWorkflowFunction,
];

/** Every kernel function implementation this renderer has, keyed by name. */
export const KERNEL_FUNCTIONS: ReadonlyMap<string, FunctionImplementation> = new Map(
  KERNEL_FUNCTION_LIST.map((fn) => [fn.name, fn]),
);

export { A2uiSurface };
