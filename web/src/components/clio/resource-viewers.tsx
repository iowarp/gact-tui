import type { ReactNode } from 'react';
import {
  ArtifactComments,
  WorkspaceDocumentView,
  WorkspaceFileComments,
  officeMediaType,
} from './comments/file-comments';
import { imageRegionAnchor, pdfRegionAnchor } from './comments/region-anchors';
import { queryKeys } from '@/lib/query-keys';
import { keepEqualBytes } from '@/lib/keep-equal-bytes';
import type { Artifact, CommentTarget, WorkspaceFileEntry } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { BookOpenIcon, CodeIcon, EyeIcon } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { artifactDetailVersionEntity } from '@/lib/session-artifacts';

import { FileTextView } from './file-text-view';
import { cadFormatOf } from './cad-file-format';
import {
  fileName,
  HDF5_MEDIA_TYPE,
  imageMediaType,
  inferredWorkspaceMediaType,
  isDocumentArtifact,
  isImageArtifact,
  isMarkdownArtifact,
  isSvg,
  isTextArtifact,
} from './resource-media-types';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useHdf5ViewerSupported } from '@/hooks/use-hdf5-viewer-supported';
import { useConnectionSettings } from '@/providers/connection-provider';
import { isTextMediaType } from '@/lib/media-types';
import { INLINE_PREVIEW_MAX_BYTES, VIEWER_BYTES_GC_TIME_MS } from '@/lib/runtime-limits';

import {
  ArtifactLineageView,
  WorkspaceFileLineage,
  type LineageActivity,
} from './artifact-lineage-view';
import {
  ArtifactRecoveryError,
  isMissingArtifactPayload,
  uniqueWorkspaceArtifactFile,
  verifyArtifactRecovery,
} from './artifact-custody';

import { ClioDocumentWorkspace } from './document-workspace';
import { PREPARING_PDF_EXPORT } from './document-open-menu';
import { useFileViewerActions } from './file-viewer-action-context';

import { HtmlFileInBrowser } from './html-in-browser';
import { isHtmlFile } from '@/lib/html-in-browser';
import { FileReadView } from './file-text-view';
import { FileSourceView } from './file-source-view';
import { ClioPdfPreview } from './pdf-preview';
import { PendingPageReadout, PendingZoomControls } from './viewer-zoom-controls';
import {
  ResourceLoading,
  ViewerNoPreview,
  ViewerReadError,
  ViewerTooLarge,
} from './resource-states';
import { FileViewerShell } from './file-viewer-shell';
import type { FileViewerSource } from './file-viewer-source';

import { ImageResourceView } from './image-resource-view';
import { StreamArtifactView } from './stream-artifact-view';
import { isStreamArtifact } from './stream-artifact';
import { DashboardResourceView } from './dashboard-view';
export { ImageResourceView } from './image-resource-view';
import { WorkspaceTextView } from './workspace-text-view';
import { t, ph } from '@lingui/core/macro';
export { TextResourceView } from './workspace-text-view';

const PREPARING_PDF_ROWS = [PREPARING_PDF_EXPORT];

/** While an Office file loads, its Download ▾ already holds Export to PDF, off. */
function PreparingPdfExport() {
  useFileViewerActions(PREPARING_PDF_ROWS);
  return null;
}

export function WorkspaceFileView({
  workspaceId,
  path,
  size,
  mediaType,
  initialPage,
  locator,
  embedded = false,
  identity,
  sessionId,
}: {
  workspaceId: string;
  path: string;
  size?: number;
  mediaType?: string;
  /** HDF5 only: the object to open on, from an `@file.h5::/path` reference. */
  locator?: string;
  /** PDF only: the page to open on, when the caller already knows which page
   * matters (e.g. the page range an agent's view_pdf call actually viewed). */
  initialPage?: number;
  /** Inline in a tool result: the bar carries `identity` instead of the crumbs, a PDF
   * fills the width and there is no Lineage. */
  embedded?: boolean;
  /** Embedded only: the type icon and name the bar leads with. */
  identity?: ReactNode;
  /** The open conversation, whose recorded artifacts give the file its Lineage. */
  sessionId?: string;
}) {
  // A listing's generic octet-stream says nothing: the name decides (a .tex is text), as it
  // does for NetCDF, whose version 4 files are HDF5.
  const detected =
    (mediaType && !NAME_DECIDES.has(mediaType) ? mediaType : '') ||
    inferredWorkspaceMediaType(path);
  const hdf5Viewer = useHdf5ViewerSupported();
  const [previewAnyway, setPreviewAnyway] = useState(false);
  // A large text file past the gate opens at its beginning or its end, as chosen.
  const [textStart, setTextStart] = useState<'head' | 'end'>();
  // A STEP is text and an STL can be listed as text: the name decides, before the text views.
  const cad = cadFormatOf(path);
  const html =
    !cad &&
    detected !== 'application/pdf' && !detected.startsWith('image/') && isHtmlFile(path, detected);
  const text = html || isTextMediaType(detected);
  const source: FileViewerSource = {
    kind: 'workspace',
    workspaceId,
    path,
    mediaType: detected,
    size,
  };
  // PDFs and images are read whole, so past the inline cap they are offered, not read.
  const tooLarge =
    !previewAnyway &&
    (cad || detected === 'application/pdf' || detected.startsWith('image/')) &&
    size !== undefined &&
    size > INLINE_PREVIEW_MAX_BYTES;
  // Text is read in windows, but past the inline cap nothing is fetched until a window is chosen.
  const textTooLarge =
    text && textStart === undefined && size !== undefined && size > INLINE_PREVIEW_MAX_BYTES;
  const preview = tooLarge ? (
    <ViewerTooLarge onPreview={() => setPreviewAnyway(true)} size={size} source={source} />
  ) : textTooLarge ? (
    <ViewerTooLarge
      onPreview={() => setTextStart('head')}
      onShowEnd={() => setTextStart('end')}
      size={size}
      source={source}
    />
  ) : cad ? (
    <Suspense fallback={<ResourceLoading label={t`Loading ${ph({ name: fileName(path) })}`} />}>
      <WorkspaceCadView format={cad} path={path} source={source} workspaceId={workspaceId} />
    </Suspense>
  ) : detected === 'application/pdf' ? (
    <WorkspacePdfView
      fit={embedded ? 'width' : 'page'}
      initialPage={initialPage}
      path={path}
      workspaceId={workspaceId}
    />
  ) : detected.startsWith('image/') ? (
    <WorkspaceImageView mediaType={detected} path={path} workspaceId={workspaceId} />
  ) : html ? (
    <WorkspaceTextView
      html={{ openOnShow: !embedded }}
      path={path}
      size={size}
      startAtEnd={textStart === 'end'}
      workspaceId={workspaceId}
      mediaType={detected}
    />
  ) : isTextMediaType(detected) ? (
    <WorkspaceTextView
      path={path}
      size={size}
      startAtEnd={textStart === 'end'}
      workspaceId={workspaceId}
      mediaType={detected}
    />
  ) : detected === HDF5_MEDIA_TYPE && hdf5Viewer ? (
    <Suspense fallback={<ResourceLoading label={t`Loading ${ph({ name: fileName(path) })}`} />}>
      {/\.nc$/iu.test(path) ? (
        <WorkspaceNetcdfView
          locator={locator}
          path={path}
          size={size}
          source={source}
          workspaceId={workspaceId}
        />
      ) : (
        <Hdf5ViewerFrame locator={locator} path={path} workspaceId={workspaceId} />
      )}
    </Suspense>
  ) : officeMediaType(path) ? (
    <WorkspaceDocumentView
      documentView={(artifact) => (
        <ClioDocumentWorkspace
          artifact={artifact}
          fallbackPreview={
            <WorkspaceBinaryView
              mediaType={detected}
              path={path}
              size={size}
              workspaceId={workspaceId}
            />
          }
          unavailablePreview={
            <WorkspaceBinaryView
              mediaType={detected}
              path={path}
              reason={t`It can't run here right now.`}
              size={size}
              title={t`Preview needs the document runtime`}
              workspaceId={workspaceId}
            />
          }
          key={artifact.id}
        />
      )}
      fallback={
        <WorkspaceBinaryView
          mediaType={detected}
          path={path}
          size={size}
          workspaceId={workspaceId}
        />
      }
      loading={
        <>
          <PreparingPdfExport />
          <PendingZoomControls label={t`PDF zoom`} readout={<PendingPageReadout />} />
          <ResourceLoading label={t`Opening ${ph({ name: fileName(path) })}`} />
        </>
      }
      mediaType={officeMediaType(path)!}
      path={path}
      workspaceId={workspaceId}
    />
  ) : (
    <WorkspaceBinaryView mediaType={detected} path={path} size={size} workspaceId={workspaceId} />
  );
  return (
    <FileViewerShell
      source={source}
      showIdentity={!embedded}
      identity={embedded ? identity : undefined}
      tabs={[
        // An Office file reads as its document from first paint, as it will once loaded.
        officeMediaType(path)
          ? { value: 'preview', label: t`Read document`, icon: BookOpenIcon, content: preview }
          : { value: 'preview', label: t`Preview`, icon: EyeIcon, content: preview },
      ]}
      lineage={
        embedded ? undefined : (
          <WorkspaceFileLineage path={path} sessionId={sessionId} workspaceId={workspaceId} />
        )
      }
    />
  );
}

const NAME_DECIDES = new Set([
  'application/octet-stream',
  'application/x-netcdf',
  'application/netcdf',
]);

const WorkspaceCadView = lazy(() =>
  import('./cad-file-view').then((module) => ({ default: module.WorkspaceCadView })),
);

const Hdf5ViewerFrame = lazy(() =>
  import('./hdf5-viewer-frame').then((module) => ({ default: module.Hdf5ViewerFrame })),
);

/** Classic NetCDF's magic: "CDF" then version 1, 2 (64-bit offsets) or 5 (CDF-5). */
function isClassicNetcdf(bytes: Uint8Array | undefined) {
  return (
    bytes !== undefined &&
    bytes[0] === 0x43 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x46 &&
    [1, 2, 5].includes(bytes[3] ?? 0)
  );
}

/**
 * A `.nc` is NetCDF-4 (HDF5, read by the array viewer) or classic NetCDF, which it
 * can't read: its first four bytes decide, before the viewer tries the file.
 */
function WorkspaceNetcdfView({
  workspaceId,
  path,
  locator,
  size,
  source,
}: {
  workspaceId: string;
  path: string;
  locator?: string;
  size?: number;
  source: FileViewerSource;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const magic = useQuery({
    queryKey: ['workspace-file-magic', settings.endpoint, workspaceId, path, size],
    queryFn: ({ signal }) =>
      repository.readWorkspaceFileRange(workspaceId, path, { start: 0, end: 3 }, signal),
    retry: false,
    staleTime: Infinity,
  });
  if (magic.isPending)
    return <ResourceLoading label={t`Loading ${ph({ name: fileName(path) })}`} />;
  if (magic.isError)
    return <ViewerReadError error={magic.error.message} onRetry={() => void magic.refetch()} />;
  if (isClassicNetcdf(magic.data?.subarray(0, 4)))
    return (
      <ViewerNoPreview
        format={t`classic NetCDF`}
        reason={t`This is a classic NetCDF file; the array viewer reads NetCDF-4, which is HDF5.`}
        source={source}
      />
    );
  // NetCDF-4, or a read the viewer reports itself.
  return <Hdf5ViewerFrame locator={locator} path={path} workspaceId={workspaceId} />;
}

function WorkspacePdfView({
  workspaceId,
  path,
  initialPage,
  fit,
}: {
  workspaceId: string;
  path: string;
  initialPage?: number;
  fit: 'page' | 'width';
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
    <WorkspaceFileComments
      modes={['text', 'region']}
      path={path}
      regionAnchor={pdfRegionAnchor}
      workspaceId={workspaceId}
    >
      <div className="size-full overflow-hidden">
        <ClioPdfPreview
          bytes={content.data}
          error={content.error?.message}
          fit={fit}
          initialPage={initialPage}
          name={fileName(path)}
          onRetry={() => void content.refetch()}
          pageFacts
        />
      </div>
    </WorkspaceFileComments>
  );
}

function WorkspaceImageView({
  workspaceId,
  path,
  mediaType,
}: {
  workspaceId: string;
  path: string;
  mediaType: string;
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
    <WorkspaceFileComments
      modes={isSvg(mediaType) ? ['region', 'element'] : ['region']}
      path={path}
      regionAnchor={imageRegionAnchor}
      svg={isSvg(mediaType) ? content.data : undefined}
      workspaceId={workspaceId}
    >
      <ImageResourceView
        bytes={content.data}
        error={content.error?.message}
        mediaType={mediaType}
        name={fileName(path)}
        onRetry={() => void content.refetch()}
      />
    </WorkspaceFileComments>
  );
}

function WorkspaceBinaryView({
  workspaceId,
  path,
  mediaType,
  size,
  reason,
  title,
}: {
  workspaceId: string;
  path: string;
  mediaType: string;
  size?: number;
  /** Why it has no viewer, before what still works. */
  reason?: string;
  /** The cause, when its viewer can't run here. */
  title?: string;
}) {
  const [asText, setAsText] = useState(false);
  return asText ? (
    <WorkspaceTextView path={path} size={size} workspaceId={workspaceId} mediaType="text/plain" />
  ) : (
    <ViewerNoPreview
      onShowText={() => setAsText(true)}
      reason={reason}
      source={{ kind: 'workspace', workspaceId, path, mediaType, size }}
      title={title}
    />
  );
}

type ArtifactViewProps = {
  artifact: Artifact;
  workspaceId: string;
  files: readonly WorkspaceFileEntry[];
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenWorkspaceFile?: (path: string) => void;
  /** Opens a lineage action's row in Activity. */
  onOpenActivity?: (activity: LineageActivity) => void;
  /** The open conversation, which holds a stream's watch lease while it is shown. */
  sessionId?: string;
  /** Whatever frames the viewer already names the file. */
  showIdentity?: boolean;
};

/** An artifact in the side panel: a stream reads from clio-core, anything else is a file. */
export function ArtifactView({ sessionId, ...props }: ArtifactViewProps) {
  return isStreamArtifact(props.artifact) ? (
    <StreamArtifactView artifact={props.artifact} sessionId={sessionId} />
  ) : (
    <ArtifactFileView {...props} />
  );
}

function ArtifactFileView({
  artifact,
  workspaceId,
  files,
  onOpenArtifact,
  onOpenWorkspaceFile,
  onOpenActivity,
  showIdentity,
}: Omit<ArtifactViewProps, 'sessionId'>) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [asText, setAsText] = useState(false);
  // This view shows one fixed version; marking again on a newer one opens that version.
  const openVersion = useMemo(
    () =>
      onOpenArtifact
        ? (target: CommentTarget) =>
            void repository
              .artifactDetail(target.artifact_id)
              .then((detail) =>
                onOpenArtifact(
                  artifactDetailVersionEntity(detail, target.artifact_id, artifact.session_id),
                ),
              )
              .catch((cause: unknown) =>
                toast.error(cause instanceof Error ? cause.message : String(cause)),
              )
        : undefined,
    [artifact.session_id, onOpenArtifact, repository],
  );
  const canPreviewText = asText || isTextArtifact(artifact.media_type, artifact.name);
  // A dashboard's frame draws Render, Definition (its JSON) and Lineage.
  const isDashboard =
    artifact.producer?.['designation'] === 'dashboard-report' ||
    artifact.name.endsWith('.dashboard.json');
  const canPreviewImage = isImageArtifact(artifact.media_type, artifact.name);
  const fallbackFile = useMemo(
    () => uniqueWorkspaceArtifactFile(artifact, workspaceId, files),
    [artifact, files, workspaceId],
  );
  const fallbackPath = fallbackFile?.path;
  const previewSize = artifact.size ?? fallbackFile?.size;
  const [previewAnyway, setPreviewAnyway] = useState(false);
  const canLoadInline =
    previewAnyway || (previewSize !== undefined && previewSize <= INLINE_PREVIEW_MAX_BYTES);
  const text = useQuery({
    queryKey: queryKeys.key('artifact-text', settings.endpoint, artifact.id, fallbackPath),
    queryFn: async ({ signal }) => {
      try {
        return {
          content: await repository.readArtifactTextFor(artifact, signal),
          recovered: false,
        };
      } catch (error) {
        if (!isMissingArtifactPayload(error)) throw error;
        const recoveredPath =
          fallbackPath ??
          uniqueWorkspaceArtifactFile(
            artifact,
            workspaceId,
            (await repository.workspaceFiles(workspaceId, signal, { excludeServiceStorage: true }))
              .entries,
          )?.path;
        if (!recoveredPath) throw error;
        const bytes = await repository.readWorkspaceFileBytes(workspaceId, recoveredPath, signal);
        await verifyArtifactRecovery(artifact, bytes, recoveredPath);
        return {
          content: new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }).decode(bytes),
          recovered: true,
          recoveredPath,
        };
      }
    },
    enabled: canPreviewText && canLoadInline,
    gcTime: VIEWER_BYTES_GC_TIME_MS,
  });
  const image = useQuery({
    queryKey: queryKeys.key('artifact-image', settings.endpoint, artifact.id, fallbackPath),
    queryFn: async ({ signal }) => {
      try {
        return { bytes: await repository.readArtifactBytesFor(artifact, signal), recovered: false };
      } catch (error) {
        if (!isMissingArtifactPayload(error)) throw error;
        const recoveredPath =
          fallbackPath ??
          uniqueWorkspaceArtifactFile(
            artifact,
            workspaceId,
            (await repository.workspaceFiles(workspaceId, signal, { excludeServiceStorage: true }))
              .entries,
          )?.path;
        if (!recoveredPath) throw error;
        const bytes = await repository.readWorkspaceFileBytes(workspaceId, recoveredPath, signal);
        await verifyArtifactRecovery(artifact, bytes, recoveredPath);
        return {
          bytes,
          recovered: true,
          recoveredPath,
        };
      }
    },
    enabled: canPreviewImage && canLoadInline,
    gcTime: VIEWER_BYTES_GC_TIME_MS,
  });
  const payloadError = text.error ?? image.error;
  const currentFile =
    payloadError instanceof ArtifactRecoveryError ? payloadError.workspacePath : fallbackPath;
  const currentFileAction =
    payloadError && currentFile && onOpenWorkspaceFile ? (
      <Button
        className="m-4 w-fit"
        variant="outline"
        onClick={() => onOpenWorkspaceFile(currentFile)}
      >
        {t`Open current workspace file`}
      </Button>
    ) : null;
  const source: FileViewerSource = {
    kind: 'artifact',
    artifact,
    workspaceId,
    verifiedWorkspacePath: text.data?.recovered
      ? text.data.recoveredPath
      : image.data?.recovered
        ? image.data.recoveredPath
        : undefined,
    unavailable:
      payloadError instanceof ArtifactRecoveryError || isMissingArtifactPayload(payloadError),
  };
  const preview = canPreviewText ? (
    !canLoadInline ? (
      <ViewerTooLarge onPreview={() => setPreviewAnyway(true)} size={previewSize} source={source} />
    ) : text.data ? (
      isDashboard ? (
        <DashboardResourceView content={text.data.content} artifactId={artifact.id} />
      ) : isHtmlFile(artifact.name, artifact.media_type) ? (
        <HtmlFileInBrowser
          artifactId={artifact.id}
          content={text.data.content}
          name={artifact.name}
          openOnShow
        />
      ) : isMarkdownArtifact(artifact.media_type, artifact.name) ? (
        <FileReadView name={artifact.name} content={text.data.content} format="markdown" />
      ) : (
        <ArtifactVersionComments artifact={artifact} onOpenVersion={openVersion} text>
          <FileTextView
            name={artifact.name}
            content={text.data.content}
            mediaType={artifact.media_type}
          />
        </ArtifactVersionComments>
      )
    ) : text.error ? (
      <ViewerReadError
        error={
          text.error instanceof ArtifactRecoveryError
            ? text.error.message
            : t`The service remembers this result, but its saved content is no longer available. Lineage still shows where it came from.`
        }
        onRetry={() => void text.refetch()}
      />
    ) : (
      <ResourceLoading label={t`Loading ${ph({ name: artifact.name })}`} />
    )
  ) : canPreviewImage ? (
    canLoadInline ? (
      <ArtifactVersionComments
        artifact={artifact}
        onOpenVersion={openVersion}
        svg={
          isSvg(artifact.media_type || imageMediaType(artifact.name))
            ? image.data?.bytes
            : undefined
        }
      >
        <ImageResourceView
          bytes={image.data?.bytes}
          error={image.error?.message}
          mediaType={artifact.media_type || imageMediaType(artifact.name)}
          name={artifact.name}
        />
      </ArtifactVersionComments>
    ) : (
      <ViewerTooLarge onPreview={() => setPreviewAnyway(true)} size={previewSize} source={source} />
    )
  ) : (
    <ViewerNoPreview onShowText={() => setAsText(true)} source={source} />
  );
  return (
    <FileViewerShell
      source={source}
      showIdentity={showIdentity}
      hasDocumentActions={
        !canPreviewImage && isDocumentArtifact(artifact.media_type, artifact.name)
      }
      label={t`Artifact views`}
      tabs={[
        {
          value: 'preview',
          label: isDashboard ? t`Render` : t`Preview`,
          icon: EyeIcon,
          content: (
            <>
              {currentFileAction}
              {canPreviewImage ? (
                <div className="flex h-full min-h-0 flex-col gap-2">
                  <div className="min-h-0 flex-1">{preview}</div>
                  {image.data?.recovered ? (
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {t`Recovered from the matching workspace file.`}
                    </p>
                  ) : null}
                </div>
              ) : isDocumentArtifact(artifact.media_type, artifact.name) ? (
                <ClioDocumentWorkspace
                  artifact={artifact}
                  fallbackPreview={preview}
                  fallbackSource={text.data?.content}
                  key={artifact.id}
                  onOpenVersion={openVersion}
                />
              ) : (
                <div className="flex h-full min-h-0 min-w-0 flex-col">
                  {/* A preview taller than the panel (a dashboard) scrolls here. */}
                  <div className="min-h-0 flex-1 overflow-auto">{preview}</div>
                  {text.data?.recovered ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t`Recovered from the matching workspace file.`}
                    </p>
                  ) : null}
                </div>
              )}
            </>
          ),
        },
        ...(isDashboard && text.data
          ? [
              {
                value: 'source',
                label: t`Definition`,
                icon: CodeIcon,
                content: <FileSourceView name={artifact.name} content={text.data.content} />,
              },
            ]
          : []),
      ]}
      lineage={
        <ArtifactLineageView
          artifact={artifact}
          onOpenArtifact={onOpenArtifact}
          onOpenActivity={onOpenActivity}
        />
      }
    />
  );
}

/** An artifact takes comments when its version is known: text marks, or regions (and SVG elements) on an image. */
function ArtifactVersionComments({
  artifact,
  svg,
  text = false,
  onOpenVersion,
  children,
}: {
  artifact: Artifact;
  /** An SVG's bytes, so element marks can pick its elements. */
  svg?: Uint8Array;
  text?: boolean;
  onOpenVersion?: (target: CommentTarget) => void;
  children: ReactNode;
}) {
  if (!artifact.sha256 || !artifact.version) return <>{children}</>;
  return (
    <ArtifactComments
      artifact={{ ...artifact, sha256: artifact.sha256, version: artifact.version }}
      modes={text ? ['text'] : svg ? ['region', 'element'] : ['region']}
      onOpenVersion={onOpenVersion}
      regionAnchor={text ? undefined : imageRegionAnchor}
      svg={svg}
    >
      {children}
    </ArtifactComments>
  );
}
