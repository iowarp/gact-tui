/** The item selected for download and subsequent message attachment. */
export interface SourceDownloadSelection {
  draftId?: string;
  path: string;
  kind: 'file' | 'folder';
  linked?: boolean;
}
