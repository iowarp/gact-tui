/**
 * What the client can tell about a media type.
 *
 * These questions are asked by every surface that decides how to render bytes
 * it was handed — the resource preview, a derivative preview — and they have to
 * be answered the same way in each, or the same file renders as text in one
 * place and as an unreadable blob in another.
 */

/**
 * `application/*` types whose bytes are text a person can read directly. The
 * `text/*` tree says so in its own name; these do not, so they are listed.
 */
const TEXT_APPLICATION_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
]);

/** Whether an `application/*` media type carries readable text. */
export function isTextApplication(mediaType: string): boolean {
  return TEXT_APPLICATION_TYPES.has(mediaType);
}

/** Whether these bytes can be rendered as text at all. */
export function isTextMediaType(mediaType: string): boolean {
  return mediaType.startsWith('text/') || isTextApplication(mediaType);
}

/** Readable file format for an output card; the original media type remains available in details. */
export function fileFormatLabel(name: string, mediaType: string): string {
  const extension = name.split('.').at(-1)?.toLowerCase();
  const labels: Record<string, string> = {
    md: 'Markdown',
    markdown: 'Markdown',
    pdf: 'PDF',
    docx: 'Word',
    xlsx: 'Excel',
    pptx: 'PowerPoint',
    odt: 'Document',
    ods: 'Spreadsheet',
    odp: 'Presentation',
    csv: 'CSV',
    tsv: 'TSV',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    png: 'PNG',
    jpg: 'JPEG',
    jpeg: 'JPEG',
    svg: 'SVG',
    webp: 'WebP',
    gif: 'GIF',
    mp4: 'Video',
    webm: 'Video',
    mp3: 'Audio',
    wav: 'Audio',
    zip: 'ZIP',
  };
  return (extension && labels[extension]) || (mediaType.startsWith('text/') ? 'Text' : 'File');
}
