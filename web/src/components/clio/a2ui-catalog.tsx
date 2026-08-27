import { Catalog, CommonSchemas } from '@a2ui/web_core/v0_9';
import {
  A2uiSurface,
  Button as A2UIButton,
  CheckBox,
  ChoicePicker,
  Column,
  Divider,
  Icon,
  Image,
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
import { GitCompareArrowsIcon, ShieldAlertIcon } from 'lucide-react';
import { lazy, Suspense } from 'react';
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
import {
  a2uiAccessibilityDescription,
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { ClioDataTable, type ClioDataColumn, type ClioDataRow } from './data-table';
import { ClioArtifactCatalogComponent } from './a2ui-artifact';
import { ClioMapCatalogComponent } from './a2ui-map';
import { ClioTimeSeriesCatalogComponent } from './a2ui-time-series-catalog';
import { ClioMermaidDiagram } from './mermaid-diagram';
import { ClioStatus, type ClioStatusProps } from './status';

const ClioA2UICodeView = lazy(() =>
  import('./a2ui-code-view').then((module) => ({ default: module.ClioA2UICodeView })),
);

export const CLIO_A2UI_CATALOG_ID = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';

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
  return value
    .replace(/["<>\r\n]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 160);
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
        nodes: z.array(workflowNode).min(1).max(128),
        edges: z.array(workflowEdge).max(256),
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
  accessibility,
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
        accessibility={accessibility}
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

const components: ReactComponentImplementation[] = [
  Text,
  Image,
  Icon,
  Row,
  Column,
  List,
  Tabs,
  Modal,
  Divider,
  A2UIButton,
  TextField,
  CheckBox,
  ChoicePicker,
  Slider,
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

// This protocol registry is intentionally exported beside its private render implementations.
// oxlint-disable-next-line react/only-export-components
export const clioA2UICatalog = new Catalog(CLIO_A2UI_CATALOG_ID, components);
export { A2uiSurface };
