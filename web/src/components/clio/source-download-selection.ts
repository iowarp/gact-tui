/** The item selected for download and subsequent message attachment. */
export interface SourceDownloadSelection {
  draftId?: string;
  path: string;
  /** The provider's name for `path`, when `path` is a portable alias of it. */
  name?: string;
  kind: 'file' | 'folder';
  linked?: boolean;
}
