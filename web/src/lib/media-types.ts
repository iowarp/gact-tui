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
