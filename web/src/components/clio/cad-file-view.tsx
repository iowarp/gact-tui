import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from '@/hooks/use-repository';
import { keepEqualBytes } from '@/lib/keep-equal-bytes';
import { queryKeys } from '@/lib/query-keys';
import { VIEWER_BYTES_GC_TIME_MS } from '@/lib/runtime-limits';
import { t, ph } from '@lingui/core/macro';
import { supportsWebGL } from './a2ui-mesh-view-state';
import { CadModelView } from './cad-model-view';
import type { FileViewerSource } from './file-viewer-source';
import { parseMeshArtifact, type MeshFormat } from './mesh-viewport-formats';
import { fileName } from './resource-media-types';
import { ResourceLoading, ViewerNoPreview, ViewerReadError } from './resource-states';

/** A stable id per byte array, so a re-read with equal bytes (kept by identity) parses once. */
const bytesIds = new WeakMap<Uint8Array, number>();
let nextBytesId = 0;
function bytesId(bytes: Uint8Array) {
  let id = bytesIds.get(bytes);
  if (id === undefined) bytesIds.set(bytes, (id = nextBytesId += 1));
  return id;
}

/** A workspace CAD or mesh file, read whole like a PDF or an image. */
export function WorkspaceCadView({
  workspaceId,
  path,
  format,
  source,
}: {
  workspaceId: string;
  path: string;
  format: MeshFormat;
  source: FileViewerSource;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const content = useQuery({
    queryKey: queryKeys.workspaceFileBytes(settings.endpoint, workspaceId, path),
    queryFn: ({ signal }) => repository.readWorkspaceFileBytes(workspaceId, path, signal),
    gcTime: VIEWER_BYTES_GC_TIME_MS,
    structuralSharing: keepEqualBytes,
  });
  return (
    <CadFileView
      bytes={content.data}
      error={content.error?.message}
      format={format}
      name={fileName(path)}
      onRetry={() => void content.refetch()}
      source={source}
    />
  );
}

/**
 * A CAD or mesh file (STEP, STL, 3MF, OBJ, PLY, glTF) as an orbitable 3D view: each part in
 * its own colour with a parts list, the model's size in the frame bar, edges over the faces,
 * standard views and the CAD tools (`cad-model-view.tsx`). The original bytes stay the
 * download; STL, GLB and a picture of the view are Export to… conversions.
 */
export function CadFileView({
  source,
  name,
  format,
  bytes,
  error,
  onRetry,
}: {
  source: FileViewerSource;
  name: string;
  format: MeshFormat;
  bytes?: Uint8Array;
  error?: string;
  onRetry?: () => void;
}) {
  const webgl = useMemo(() => supportsWebGL(), []);
  const model = useQuery({
    queryKey: ['cad-model', format, bytes ? bytesId(bytes) : 0],
    queryFn: () => parseMeshArtifact(bytes!, format),
    enabled: webgl && bytes !== undefined,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  if (!webgl)
    return (
      <ViewerNoPreview
        source={source}
        title={t`3D view needs WebGL`}
        reason={t`This browser can't draw 3D graphics, so the model can't be shown here.`}
      />
    );
  if (error) return <ViewerReadError error={error} onRetry={onRetry} />;
  if (model.isError)
    return <ViewerReadError error={model.error.message} onRetry={() => void model.refetch()} />;
  if (!model.data) return <ResourceLoading label={t`Opening ${ph({ name })}`} />;
  return <CadModelView format={format} mesh={model.data} name={name} />;
}
