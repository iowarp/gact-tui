import { nanoid } from 'nanoid';

export const DEFAULT_PASTE_SOURCE_THRESHOLD = 4_000;
export const COMPOSER_ATTACHMENT_MAX_BYTES = 250 * 1024 * 1024;

/** Keep clipboard text verbatim in a normal source attachment, with a unique readable name. */
export function pastedTextFile(text: string): File {
  return new File([text], `Pasted text ${new Date().toISOString().slice(0, 10)} ${nanoid(6)}.txt`, {
    type: 'text/plain',
  });
}
