import { createContext } from 'react';

/** Source larger than this renders as a virtualized plain-text list instead of a highlighted block. */
export const LARGE_SOURCE_CHARS = 128_000;
const LARGE_SOURCE_LINES = 2_000;

/** A windowed file's next-window request, consumed by the source list as it nears its end. */
export const SourceWindowContext = createContext<{ onEndReached?: () => void } | undefined>(
  undefined,
);

/** Whether source is too large to tokenize and render whole. */
export function isLargeSource(content: string): boolean {
  if (content.length > LARGE_SOURCE_CHARS) return true;
  let lines = 0;
  for (let index = content.indexOf('\n'); index >= 0; index = content.indexOf('\n', index + 1)) {
    lines += 1;
    if (lines > LARGE_SOURCE_LINES) return true;
  }
  return false;
}
