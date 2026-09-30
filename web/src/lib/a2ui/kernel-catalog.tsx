import {
  CommonSchemas,
  ImageApi,
  VideoApi,
  AudioPlayerApi,
  childList,
  componentId,
} from '@a2ui/web_core/v0_9';
import type { ResolvedChildRef } from '@a2ui/web_core/v0_9';
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
import { GitCompareArrowsIcon, ShieldAlertIcon } from 'lucide-react';
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
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from '@/components/clio/a2ui-accessibility';
import { ClioArtifactCatalogComponent } from '@/components/clio/a2ui-artifact';
import { A2uiMedia } from '@/components/clio/a2ui-media';
import { refinedStrictObject } from '@/components/clio/a2ui-refined-schema';
import { ClioChartCatalogComponent } from '@/components/clio/a2ui-chart-catalog';
import { ClioDataTableCatalogComponent } from '@/components/clio/a2ui-data-table';
import { ClioMapCatalogComponent } from '@/components/clio/a2ui-map';
import { ClioMermaidCatalogComponent } from '@/components/clio/a2ui-mermaid-catalog';
import { ClioMeshViewportCatalogComponent } from '@/components/clio/a2ui-mesh-viewport-catalog';
import { ClioSliderCatalogComponent } from '@/components/clio/a2ui-slider-catalog';
import { ClioWorkflowCatalogComponent } from '@/components/clio/a2ui-workflow-catalog';
import { useArtifactText } from '@/components/clio/artifact-text-query';
import { ClioStatus, type ClioStatusProps } from '@/components/clio/status';

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
 * Resolves one `ChildList`-typed entry back to the plain id `buildChild`
 * (render-mode) expects. `childList()`/`componentId()` (0.11.x) make the
 * node layer's resolver track these as real child references — unmarked, an
 * unresolvable id renders nothing rather than being reported by name — but
 * the render-mode `buildChild` this file uses still only takes `(id,
 * basePath?)`, so a resolved `{id, basePath}` object is unwrapped here
 * instead of threaded through as an opaque node.
 */
function childRefId(child: string | ResolvedChildRef): string {
  return typeof child === 'string' ? child : child.id;
}
function childRefBasePath(child: string | ResolvedChildRef): string | undefined {
  return typeof child === 'string' ? undefined : child.basePath;
}

const Grid = createComponentImplementation(
  {
    name: 'Grid',
    schema: z
      .object({
        children: childList(),
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
      {props.children.map((child) => (
        <div key={childRefId(child)}>{buildChild(childRefId(child), childRefBasePath(child))}</div>
      ))}
    </div>
  ),
);

const Frame = createComponentImplementation(
  {
    name: 'Frame',
    schema: z
      .object({
        child: componentId(),
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

function ClioCodeArtifactSource({
  accessibility,
  dataUri,
  language,
  title,
}: {
  accessibility?: A2UIAccessibility;
  dataUri: string;
  language: string;
  title?: string;
}) {
  const { text, loading, error } = useArtifactText(dataUri);
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Code unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (loading || text === undefined) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  }
  return (
    <RenderedCode accessibility={accessibility} code={text} language={language} title={title} />
  );
}

const codeDataProperties = {
  code: CommonSchemas.DynamicString.optional(),
  dataUri: z.string().regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u).optional(),
  language: z.string(),
  title: CommonSchemas.DynamicString.optional(),
  accessibility,
  weight,
};
type CodeShape = z.infer<z.ZodObject<typeof codeDataProperties>>;
function checkCodeComponent(value: CodeShape, context: z.RefinementCtx): void {
  if (Boolean(value.code) === Boolean(value.dataUri)) {
    context.addIssue({ code: 'custom', message: 'Provide exactly one of code or dataUri' });
  }
}

const Code = createComponentImplementation(
  { name: 'clio.code.v1', schema: refinedStrictObject(codeDataProperties, checkCodeComponent) },
  ({ props }) =>
    props.dataUri ? (
      <ClioCodeArtifactSource
        accessibility={props.accessibility}
        dataUri={props.dataUri}
        language={props.language}
        title={props.title}
      />
    ) : (
      <RenderedCode
        accessibility={props.accessibility}
        code={props.code!}
        language={props.language}
        title={props.title}
      />
    ),
);

function ClioDiffView({
  accessibility,
  action,
  diff,
  path,
  status,
}: {
  accessibility?: A2UIAccessibility;
  action?: () => void;
  diff: string;
  path: string;
  status?: string;
}) {
  return (
    <div {...a2uiAccessibilityProps(accessibility)} className="grid gap-2" role="group">
      <RenderedCode accessibility={accessibility} code={diff} language="diff" title={path} />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitCompareArrowsIcon aria-hidden="true" className="size-3.5" />
        <span>{status || 'Proposed change'}</span>
        {action ? (
          <Button className="ml-auto" onClick={() => void action()} size="sm" variant="outline">
            Open diff
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ClioDiffArtifactSource({
  accessibility,
  action,
  dataUri,
  path,
  status,
}: {
  accessibility?: A2UIAccessibility;
  action?: () => void;
  dataUri: string;
  path: string;
  status?: string;
}) {
  const { text, loading, error } = useArtifactText(dataUri);
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Diff unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (loading || text === undefined) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  }
  return (
    <ClioDiffView accessibility={accessibility} action={action} diff={text} path={path} status={status} />
  );
}

const diffDataProperties = {
  path: z.string(),
  diff: CommonSchemas.DynamicString.optional(),
  dataUri: z.string().regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u).optional(),
  status: CommonSchemas.DynamicString.optional(),
  action: CommonSchemas.Action.optional(),
  accessibility,
  weight,
};
type DiffShape = z.infer<z.ZodObject<typeof diffDataProperties>>;
function checkDiffComponent(value: DiffShape, context: z.RefinementCtx): void {
  if (Boolean(value.diff) === Boolean(value.dataUri)) {
    context.addIssue({ code: 'custom', message: 'Provide exactly one of diff or dataUri' });
  }
}

const Diff = createComponentImplementation(
  { name: 'clio.diff.v1', schema: refinedStrictObject(diffDataProperties, checkDiffComponent) },
  ({ props }) =>
    props.dataUri ? (
      <ClioDiffArtifactSource
        accessibility={props.accessibility}
        action={props.action ? () => void props.action?.() : undefined}
        dataUri={props.dataUri}
        path={props.path}
        status={props.status}
      />
    ) : (
      <ClioDiffView
        accessibility={props.accessibility}
        action={props.action ? () => void props.action?.() : undefined}
        diff={props.diff!}
        path={props.path}
        status={props.status}
      />
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

// Every media URL renders through the ONE shared resolver (`A2uiMedia`): the
// guard, then a CLIO reference read with the connection's bearer as a `blob:`
// URL, or an explicit link for external media -- never a raw `src`.
const Image = createComponentImplementation(ImageApi, ({ props, context }) => (
  <A2uiMedia
    componentId={context.componentModel.id}
    kind="image"
    label={props.description}
    objectFit={IMAGE_OBJECT_FIT[props.fit ?? 'cover']}
    url={props.url}
  />
));

const Video = createComponentImplementation(VideoApi, ({ props, context }) => (
  <A2uiMedia
    componentId={context.componentModel.id}
    kind="video"
    label={a2uiAccessibilityLabel(props.accessibility)}
    url={props.url}
  />
));

const AudioPlayer = createComponentImplementation(AudioPlayerApi, ({ props, context }) => (
  <A2uiMedia
    componentId={context.componentModel.id}
    kind="audio"
    label={props.description}
    url={props.url}
  />
));

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
  ClioDataTableCatalogComponent,
  ClioChartCatalogComponent,
  ClioMermaidCatalogComponent,
  ClioMapCatalogComponent,
  ClioMeshViewportCatalogComponent,
  ClioSliderCatalogComponent,
  ClioWorkflowCatalogComponent,
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

// Catalog function implementations (openUrl/openArtifact/selectData/
// focusWorkflow) live in kernel-catalog-functions.ts, split out purely for
// file size (the 800-line CI ratchet) — re-exported here so every existing
// `from './kernel-catalog'` import keeps working.
export { KERNEL_FUNCTIONS } from './kernel-catalog-functions';

export { A2uiSurface };
