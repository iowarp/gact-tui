import { FileTextIcon } from 'lucide-react';
import { useContext, useMemo } from 'react';
import { FileViewerActionRegistry, useFileViewerActions } from './file-viewer-action-context';
import { FileDownloadControl } from './file-download-control';

/** Contribute document conversions to the common file control, including standalone viewers. */
export function DocumentDownloadActions({
  name,
  mediaType,
  pdf,
  pdfPending,
  onPdf,
  onDownload,
}: {
  name: string;
  mediaType: string;
  pdf: boolean;
  pdfPending: boolean;
  onPdf: () => Promise<void>;
  onDownload: () => Promise<void>;
}) {
  const shared = useContext(FileViewerActionRegistry);
  const formats = useMemo(
    () =>
      pdf
        ? [
            {
              kind: 'download' as const,
              label: 'PDF',
              icon: FileTextIcon,
              disabled: pdfPending,
              onSelect: onPdf,
            },
          ]
        : [],
    [pdf, pdfPending, onPdf],
  );
  useFileViewerActions(formats);
  return shared ? null : (
    <FileDownloadControl
      name={name}
      mediaType={mediaType}
      formats={formats}
      onDownload={onDownload}
    />
  );
}
