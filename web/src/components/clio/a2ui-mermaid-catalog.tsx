import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  a2uiAccessibilityDescription,
  a2uiAccessibilityLabel,
} from './a2ui-accessibility';
import { refinedStrictObject } from './a2ui-refined-schema';
import { useArtifactText } from './artifact-text-query';
import { ClioMermaidDiagram } from './mermaid-diagram';

interface ClioMermaidArtifactSourceProps {
  accessibilityDescription?: string;
  accessibilityLabel?: string;
  dataUri: string;
  title?: string;
}

/** Resolves `clio.mermaid.v1`'s `dataUri` to text, then renders the same diagram inline source uses. */
// oxlint-disable-next-line react/only-export-components
function ClioMermaidArtifactSource({
  accessibilityDescription,
  accessibilityLabel,
  dataUri,
  title,
}: ClioMermaidArtifactSourceProps) {
  const { text, loading, error } = useArtifactText(dataUri);
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Diagram unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (loading || text === undefined) {
    return (
      <div
        aria-label={`Loading ${title || 'diagram'}`}
        className="h-48 animate-pulse rounded-lg bg-muted"
      />
    );
  }
  return (
    <ClioMermaidDiagram
      accessibilityDescription={accessibilityDescription}
      accessibilityLabel={accessibilityLabel}
      source={text}
      title={title}
    />
  );
}

const mermaidDataProperties = {
  source: CommonSchemas.DynamicString.optional(),
  dataUri: z.string().regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u).optional(),
  title: CommonSchemas.DynamicString.optional(),
  accessibility: CommonSchemas.AccessibilityAttributes.optional(),
  weight: z.number().optional(),
};

type MermaidShape = z.infer<z.ZodObject<typeof mermaidDataProperties>>;

/** `clio.mermaid.v1`'s cross-field rule: exactly one of `source` or `dataUri`. */
function checkMermaidComponent(value: MermaidShape, context: z.RefinementCtx): void {
  if (Boolean(value.source) === Boolean(value.dataUri)) {
    context.addIssue({ code: 'custom', message: 'Provide exactly one of source or dataUri' });
  }
}

export const mermaidComponentSchema = refinedStrictObject(
  mermaidDataProperties,
  checkMermaidComponent,
);

export const ClioMermaidCatalogComponent = createComponentImplementation(
  { name: 'clio.mermaid.v1', schema: mermaidComponentSchema },
  ({ props }) =>
    props.dataUri ? (
      <ClioMermaidArtifactSource
        accessibilityDescription={a2uiAccessibilityDescription(props.accessibility)}
        accessibilityLabel={a2uiAccessibilityLabel(props.accessibility)}
        dataUri={props.dataUri}
        title={props.title}
      />
    ) : (
      <ClioMermaidDiagram
        accessibilityDescription={a2uiAccessibilityDescription(props.accessibility)}
        accessibilityLabel={a2uiAccessibilityLabel(props.accessibility)}
        source={props.source!}
        title={props.title}
      />
    ),
);
