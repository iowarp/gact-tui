import { asRecord } from './tool-result-shared';
import { operationAnswer } from './tool-operation-data';

/** Assemble only contiguous fragments of the same immutable result before parsing JSON. */
export async function readOperationPages(
  first: Record<string, unknown>,
  read: (cursor: string, signal: AbortSignal) => Promise<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<unknown> {
  let page = first;
  const reference = asRecord(page.result_reference);
  const hash = reference?.sha256;
  if (!reference || typeof hash !== 'string' || page.offset !== 0)
    throw new Error('The beginning of this recorded result was not retained.');
  const parts: string[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (let index = 0; index < 256; index++) {
    if (signal.aborted) throw new DOMException('Result reading cancelled', 'AbortError');
    if (
      asRecord(page.result_reference)?.sha256 !== hash ||
      page.offset !== offset ||
      page.fragments_require_concatenation !== true
    )
      throw new Error('The recorded result changed while reading.');
    const fragment = asRecord(page.result)?.preview;
    if (typeof fragment !== 'string') throw new Error('The result fragment is missing.');
    const nextOffset = offset + Array.from(fragment).length;
    if (page.next_offset !== nextOffset || nextOffset > 8_000_000)
      throw new Error('Invalid result fragment boundary.');
    parts.push(fragment);
    if (page.next_cursor === null) return operationAnswer(JSON.parse(parts.join('')) as unknown);
    if (typeof page.next_cursor !== 'string' || seen.has(page.next_cursor))
      throw new Error('Invalid result continuation cursor.');
    seen.add(page.next_cursor);
    offset = nextOffset;
    page = await read(page.next_cursor, signal);
  }
  throw new Error('The result exceeds the reading limit.');
}
