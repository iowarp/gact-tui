import type { Artifact as ArtifactEntity } from '@clio/core/v3';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { z } from 'zod';
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
  const artifact: ArtifactEntity = {
    id: artifactIdFromUri(uri),
    media_type: mediaType,
    name,
    session_id: '',
    session_relation: 'produced',
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
  ({ props }) => (
    <ClioA2UIArtifact
      accessibility={props.accessibility}
      action={props.action}
      mediaType={props.mediaType}
      name={props.name}
      size={props.size}
      uri={props.uri}
    />
  ),
);
