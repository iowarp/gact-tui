import { isClioReference, type Artifact as ArtifactEntity } from '@clio/core/v3';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { AlertTriangleIcon } from 'lucide-react';
import { z } from 'zod';
import { Spinner } from '@/components/ui/spinner';
import { useA2uiReference } from '@/lib/a2ui/use-a2ui-reference';
import { useA2uiUrlGuard } from '@/lib/a2ui/url-guard';
import { a2uiAccessibilityProps, type A2UIAccessibility } from './a2ui-accessibility';
import { A2uiExternalMedia, A2uiMediaNotice } from './a2ui-media';
import { ClioArtifactCard } from './artifact-card';

interface ClioA2UIArtifactProps {
  accessibility?: A2UIAccessibility;
  action?: () => void;
  mediaType: string;
  name: string;
  size?: number;
  uri: string;
}

/**
 * Renders a protocol artifact through the same AI Elements card used by native
 * CLIO output. The reference is resolved by the service first, so the card
 * gets the REAL identity (version id, workspace, size, byte route) for every
 * URI form -- `artifact://<ws>/<name>@vN`, `artifact:<id>`, `resource:…` --
 * and reads its preview through the authenticated repository.
 */
export function ClioA2UIArtifact({
  accessibility,
  action,
  mediaType,
  name,
  size,
  uri,
}: ClioA2UIArtifactProps) {
  const reference = isClioReference(uri);
  const state = useA2uiReference(uri, { readBytes: false, enabled: reference });
  const resolved = state.resolution;
  // The protocol component carries no session relation, so none is claimed here.
  const artifact: ArtifactEntity = {
    id: resolved?.artifact_id ?? resolved?.resource_id ?? uri,
    media_type: mediaType || resolved?.media_type || '',
    name: name || resolved?.name || '',
    session_id: '',
    size: size ?? resolved?.size_bytes ?? undefined,
    uri,
    workspace_id: resolved?.workspace_id,
    fetch_path: resolved?.fetch_path,
  };

  return (
    <div {...a2uiAccessibilityProps(accessibility)} className="flex flex-col gap-2" role="group">
      <ClioArtifactCard
        artifact={artifact}
        onOpen={action ? () => void action() : undefined}
        preview={Boolean(resolved)}
      />
      {!reference ? <A2uiExternalMedia kind="file" url={uri} /> : null}
      {state.failure ? <A2uiMediaNotice failure={state.failure} kind="file" /> : null}
      {reference && state.pending ? (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Locating this file on the connected service…
        </p>
      ) : null}
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
