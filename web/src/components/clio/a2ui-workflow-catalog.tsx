import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { A2UI_WORKFLOW_EDGES_MAX, A2UI_WORKFLOW_NODES_MAX } from '@clio/core/v3';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { truncate } from '@/lib/format';
import { DIAGRAM_LABEL_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import {
  a2uiAccessibilityDescription,
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { refinedStrictObject } from './a2ui-refined-schema';
import { useArtifactText } from './artifact-text-query';
import { ClioMermaidDiagram } from './mermaid-diagram';
import { buildZoneReference } from './data-zone-reference';

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

/** `dataUri` shape for `clio.workflow.v1`: a JSON file shaped `{nodes, edges}`. */
const workflowFileSchema = z
  .object({
    nodes: z.array(workflowNode).min(1).max(A2UI_WORKFLOW_NODES_MAX),
    edges: z.array(workflowEdge).max(A2UI_WORKFLOW_EDGES_MAX),
  })
  .strict();

type WorkflowNode = z.infer<typeof workflowNode>;
type WorkflowEdge = z.infer<typeof workflowEdge>;

function mermaidLabel(value: string): string {
  const line = value
    .replace(/["<>\r\n]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return truncate(line, DIAGRAM_LABEL_TRUNCATE_CHARS);
}

function workflowSource(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
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

interface ClioWorkflowDiagramProps {
  accessibility?: A2UIAccessibility;
  action?: () => void;
  /** The artifact `{nodes, edges}` was read from, when it has one — named in exports/references only. */
  dataUri?: string;
  nodes: readonly WorkflowNode[];
  edges: readonly WorkflowEdge[];
  selected?: string;
}

// oxlint-disable-next-line react/only-export-components
function ClioWorkflowDiagram({
  accessibility,
  action,
  dataUri,
  nodes,
  edges,
  selected,
}: ClioWorkflowDiagramProps) {
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const interactiveNodes = useMemo(() => nodes.map(({ id, label }) => ({ id, label })), [nodes]);
  const selectNode = (id: string, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    setSelectedNodeIds((previous) => {
      if (modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey) {
        return previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id];
      }
      return previous.length === 1 && previous[0] === id ? [] : [id];
    });
  };
  const selectedNodes = nodes.filter((node) => selectedNodeIds.includes(node.id));
  const reference = () => buildZoneReference({
    componentLabel: 'Workflow',
    datasetLabel: dataUri ?? 'inline workflow',
    filters: [],
    zoneDescription: selectedNodes.length ? `${selectedNodes.length} selected workflow ${selectedNodes.length === 1 ? 'step' : 'steps'}` : 'the whole workflow',
    previewColumns: ['id', 'label', 'state', 'detail'],
    previewRows: selectedNodes,
    query: {
      ...(dataUri ? { dataUri } : { nodes, edges }),
      ...(selectedNodes.length ? { selection: { field: 'id', values: selectedNodes.map((node) => node.id) } } : {}),
    },
  });
  return (
    <div {...a2uiAccessibilityProps(accessibility)} className="grid gap-2" role="group">
      <ClioMermaidDiagram
        accessibilityDescription={a2uiAccessibilityDescription(accessibility)}
        accessibilityLabel={a2uiAccessibilityLabel(accessibility)}
        dataUri={dataUri}
        source={workflowSource(nodes, edges, selected)}
        title="Workflow"
        interactiveNodes={interactiveNodes}
        selectedNodeIds={selectedNodeIds}
        onNodeClick={selectNode}
        referenceOverride={reference}
      />
      <div className="sr-only focus-within:not-sr-only focus-within:flex focus-within:flex-wrap focus-within:gap-1" aria-label="Workflow steps" role="group">
        {nodes.map((node) => <Button aria-pressed={selectedNodeIds.includes(node.id)} key={node.id} onClick={(event) => selectNode(node.id, event)} size="sm" type="button" variant="outline">Select {node.label}</Button>)}
      </div>
      {selectedNodes.length ? <div className="flex items-center gap-2 text-xs" aria-live="polite"><span className="min-w-0 truncate">Selected: {selectedNodes.map((node) => node.label).join(', ')}</span><Button onClick={() => setSelectedNodeIds([])} size="xs" variant="ghost">Clear</Button></div> : null}
      {action && selected ? (
        <Button
          className="justify-self-start"
          onClick={() => void action()}
          size="sm"
          variant="outline"
        >
          Focus {nodes.find((node) => node.id === selected)?.label ?? 'selected step'}
        </Button>
      ) : null}
    </div>
  );
}

interface ClioWorkflowArtifactSourceProps {
  accessibility?: A2UIAccessibility;
  action?: () => void;
  dataUri: string;
  selected?: string;
}

/** Resolves `clio.workflow.v1`'s `dataUri` JSON file to `{nodes, edges}`, then renders the graph. */
// oxlint-disable-next-line react/only-export-components
function ClioWorkflowArtifactSource({
  accessibility,
  action,
  dataUri,
  selected,
}: ClioWorkflowArtifactSourceProps) {
  const { text, loading, error } = useArtifactText(dataUri);
  const parsed = useMemo(():
    | { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
    | { error: string }
    | undefined => {
    if (text === undefined) return undefined;
    try {
      return workflowFileSchema.parse(JSON.parse(text));
    } catch (reason) {
      return { error: reason instanceof Error ? reason.message : 'invalid workflow file' };
    }
  }, [text]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Workflow unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (loading || !parsed) {
    return <div className="h-32 animate-pulse rounded-lg bg-muted" />;
  }
  if ('error' in parsed) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Workflow unavailable</AlertTitle>
        <AlertDescription>
          the referenced file is not a valid {'{nodes, edges}'} workflow: {parsed.error}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <ClioWorkflowDiagram
      accessibility={accessibility}
      action={action}
      dataUri={dataUri}
      edges={parsed.edges}
      nodes={parsed.nodes}
      selected={selected}
    />
  );
}

const workflowDataProperties = {
  nodes: z.array(workflowNode).min(1).max(A2UI_WORKFLOW_NODES_MAX).optional(),
  edges: z.array(workflowEdge).max(A2UI_WORKFLOW_EDGES_MAX).optional(),
  dataUri: z.string().regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u).optional(),
  selected: z.string().optional(),
  action: CommonSchemas.Action.optional(),
  accessibility: CommonSchemas.AccessibilityAttributes.optional(),
  weight: z.number().optional(),
};

type WorkflowShape = z.infer<z.ZodObject<typeof workflowDataProperties>>;

/** `clio.workflow.v1`'s cross-field rule: exactly one of `nodes`+`edges` or `dataUri`. */
function checkWorkflowComponent(value: WorkflowShape, context: z.RefinementCtx): void {
  const inline = Boolean(value.nodes) || Boolean(value.edges);
  if (inline === Boolean(value.dataUri)) {
    context.addIssue({ code: 'custom', message: 'Provide exactly one of nodes+edges or dataUri' });
  }
  if (inline && (!value.nodes || !value.edges)) {
    context.addIssue({
      code: 'custom',
      message: 'nodes and edges are both required when given inline',
    });
  }
}

export const workflowComponentSchema = refinedStrictObject(
  workflowDataProperties,
  checkWorkflowComponent,
);

export const ClioWorkflowCatalogComponent = createComponentImplementation(
  { name: 'clio.workflow.v1', schema: workflowComponentSchema },
  ({ props }) =>
    props.dataUri ? (
      <ClioWorkflowArtifactSource
        accessibility={props.accessibility}
        action={props.action ? () => void props.action?.() : undefined}
        dataUri={props.dataUri}
        selected={props.selected}
      />
    ) : (
      <ClioWorkflowDiagram
        accessibility={props.accessibility}
        action={props.action ? () => void props.action?.() : undefined}
        edges={props.edges!}
        nodes={props.nodes!}
        selected={props.selected}
      />
    ),
);
