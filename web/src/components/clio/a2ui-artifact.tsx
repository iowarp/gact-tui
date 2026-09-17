import type { Artifact as ArtifactEntity } from '@clio/core/v3';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { AlertTriangleIcon } from 'lucide-react';
import { z } from 'zod';
import { useA2uiUrlGuard } from '@/lib/a2ui/url-guard';
import { a2uiAccessibilityProps, type A2UIAccessibility } from './a2ui-accessibility';
import { ClioArtifactCard } from './artifact-card';

interface ClioA2UIArtifactProps {
  accessibility?: A2UIAccessibility;
  action?: () => void;
  mediaType: string;
  name: string;
  size?: number;
  uri: string;
}

function artifactIdFromUri(uri: string): string {
  const value = uri.startsWith('artifact://') ? uri.slice('artifact://'.length) : uri;
  return value.startsWith('artifact_') && !value.includes('/') ? value : uri;
}

/** Renders a protocol artifact through the same AI Elements card used by native CLIO output. */
export function ClioA2UIArtifact({
  accessibility,
  action,
  mediaType,
  name,
  size,
  uri,
}: ClioA2UIArtifactProps) {
  // The protocol component carries no session relation, so none is claimed here.
  const artifact: ArtifactEntity = {
    id: artifactIdFromUri(uri),
    media_type: mediaType,
    name,
    session_id: '',
    size,
    uri,
  };

  return (
    <div {...a2uiAccessibilityProps(accessibility)} role="group">
      <ClioArtifactCard artifact={artifact} onOpen={action ? () => void action() : undefined} />
    </div>
  );
}

// The protocol adapter stays thin; visual and interaction semantics are owned by ClioArtifactCard.
// oxlint-disable-next-line react/only-export-components
export const ClioArtifactCatalogComponent = createComponentImplementation(
  {
    name: 'clio.artifact.v1',
    schema: z
      .object({
        name: CommonSchemas.DynamicString,
        uri: z.string(),
        mediaType: z.string(),
        size: CommonSchemas.DynamicNumber.optional(),
        action: CommonSchemas.Action.optional(),
        accessibility: CommonSchemas.AccessibilityAttributes.optional(),
        weight: z.number().optional(),
      })
      .strict(),
  },
  ({ props, context }) => {
    const guard = useA2uiUrlGuard(context.componentModel.id, 'uri', props.uri);
    if (!guard.ok) {
      return (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          <AlertTriangleIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{guard.message}</span>
        </div>
      );
    }
    return (
      <ClioA2UIArtifact
        accessibility={props.accessibility}
        action={props.action}
        mediaType={props.mediaType}
        name={props.name}
        size={props.size}
        uri={props.uri}
      />
    );
  },
);
