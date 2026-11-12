import type { ClioRepository, DocumentManifest } from '@clio/core/v3';
import { openDocumentWorkingCopy, openFileBytes } from '@/tauri/documents';
import type { DocumentOpenTarget } from './document-open-menu';
import { documentPdfFileName } from './document-pdf';

type LaunchRepository = Pick<
  ClioRepository,
  'documentContent' | 'createDocumentWorkingCopy' | 'closeDocumentWorkingCopy'
>;

/** Launch original bytes for read-only files, or retain save tracking for editable documents. */
export async function openDocumentTarget(
  repository: LaunchRepository,
  manifest: DocumentManifest | undefined,
  sessionId: string,
  preparePdf: () => Promise<DocumentManifest>,
  target: DocumentOpenTarget,
) {
  const isPdf = target.format === 'pdf';
  const source = isPdf ? await preparePdf() : manifest;
  if (!source) throw new Error('The document is not available yet.');
  const readOnly = isPdf || ['pdf', 'html-static', 'binary'].includes(source.profile);
  if (readOnly) {
    await openFileBytes(
      isPdf && manifest ? documentPdfFileName(manifest.name) : source.name.split(/[\\/]/u).at(-1)!,
      await repository.documentContent(source.artifact_id),
      target.application.id,
    );
    return {
      kind: 'native' as const,
      copy: undefined,
      appName: target.application.name,
      isPdf,
      desktopCopy: true,
    };
  }
  const copy = await repository.createDocumentWorkingCopy(source.artifact_id, {
    session_id: sessionId,
    writable: !readOnly,
    auto_checkpoint: !readOnly,
  });
  try {
    let desktopCopy = false;
    try {
      await openDocumentWorkingCopy(copy.path, target.application.id);
    } catch (error) {
      // A remote service's working-copy path is not on this desktop.
      if (!String(error).includes('document path is unavailable')) throw error;
      await openFileBytes(
        source.name.split(/[\\/]/u).at(-1)!,
        await repository.documentContent(source.artifact_id),
        target.application.id,
      );
      await repository.closeDocumentWorkingCopy(copy.id);
      desktopCopy = true;
    }
    return {
      kind: 'native' as const,
      copy,
      appName: target.application.name,
      isPdf,
      desktopCopy,
    };
  } catch (error) {
    // An application that did not open must not leave an apparently active copy.
    try {
      await repository.closeDocumentWorkingCopy(copy.id);
    } catch (closeError) {
      throw new Error(
        `${error instanceof Error ? error.message : 'The application could not open the document.'} Could not close its working copy: ${closeError instanceof Error ? closeError.message : 'unknown error'}`,
      );
    }
    throw error;
  }
}
