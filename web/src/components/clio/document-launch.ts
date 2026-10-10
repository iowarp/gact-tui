import type { ClioRepository, DocumentManifest } from '@clio/core/v3';
import { openDocumentWorkingCopy, openFileBytes } from '@/tauri/documents';
import type { DocumentOpenTarget } from './document-open-menu';

type LaunchRepository = Pick<
  ClioRepository,
  | 'documentEditorHealth'
  | 'documentContent'
  | 'createDocumentWorkingCopy'
  | 'closeDocumentWorkingCopy'
  | 'createDocumentEditorSession'
>;

/** Launch original bytes for read-only files, or retain save tracking for editable documents. */
export async function openDocumentTarget(
  repository: LaunchRepository,
  manifest: DocumentManifest | undefined,
  sessionId: string,
  preparePdf: () => Promise<DocumentManifest>,
  target: DocumentOpenTarget,
) {
  const provider = target.kind === 'embedded' ? target.provider : 'native';
  const isPdf = target.kind === 'native' && target.format === 'pdf';
  const source = isPdf ? await preparePdf() : manifest;
  if (!source) throw new Error('The document is not available yet.');
  if (provider !== 'native') {
    const health = await repository.documentEditorHealth();
    const available = health.editors.find((entry) => entry.provider === provider);
    if (!available?.healthy) {
      throw new Error(
        `${editorLabel(provider)} is unavailable. Check its connection before opening it.`,
      );
    }
  }
  const readOnly = isPdf || ['pdf', 'html-static', 'binary'].includes(source.profile);
  if (target.kind === 'native' && readOnly) {
    await openFileBytes(
      source.name.split(/[\\/]/u).at(-1)!,
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
    provider,
    writable: !readOnly,
    auto_checkpoint: !readOnly,
  });
  try {
    if (target.kind === 'native') {
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
    }
    const launched = await repository.createDocumentEditorSession(copy.id, target.provider);
    if (launched.status !== 'ready' || !launched.editor_url) {
      throw new Error(launched.error || `${editorLabel(provider)} could not start.`);
    }
    return { kind: 'embedded' as const, copy, launched };
  } catch (error) {
    // An editor that did not launch must not leave an apparently active copy.
    try {
      await repository.closeDocumentWorkingCopy(copy.id);
    } catch (closeError) {
      throw new Error(
        `${error instanceof Error ? error.message : 'Editor could not start.'} Could not close its working copy: ${closeError instanceof Error ? closeError.message : 'unknown error'}`,
      );
    }
    throw error;
  }
}

/** Human-readable name of the native or embedded editor. */
export function editorLabel(provider: string) {
  if (provider === 'onlyoffice') return 'ONLYOFFICE';
  if (provider === 'collabora') return 'Collabora';
  return 'desktop editor';
}
