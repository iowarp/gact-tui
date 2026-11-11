import type { ClioRepository, DocumentManifest } from '@clio/core/v3';

/**
 * The file name a document's PDF is saved or opened under: report.docx gives report.pdf.
 * The rendition artifact's own name (report.docx.v1.pdf) keys it to its source version
 * on the server and is not a name for the reader.
 */
export function documentPdfFileName(sourceName: string): string {
  const base = sourceName.split(/[\\/]/u).at(-1) || 'document';
  const stem = base.replace(/\.[^.]+$/u, '') || base;
  return `${stem}.pdf`;
}

/** Reuse an immutable PDF rendition or convert the original once before opening/exporting. */
export async function prepareDocumentPdf(
  repository: Pick<ClioRepository, 'documentManifest' | 'createDocumentRendition'>,
  source: DocumentManifest | undefined,
  sessionId: string,
): Promise<DocumentManifest> {
  if (!source) throw new Error('The document is not available yet.');
  const pdf =
    source.profile === 'pdf'
      ? source
      : source.pdf_rendition_artifact_id
        ? await repository.documentManifest(source.pdf_rendition_artifact_id)
        : (await repository.createDocumentRendition(source.artifact_id, sessionId)).artifact;
  if (pdf.profile !== 'pdf') throw new Error('The conversion did not produce a PDF.');
  return pdf;
}
