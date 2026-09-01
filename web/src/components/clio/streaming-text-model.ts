export interface StreamingTextParts {
  stableText: string;
  trailingText: string;
}

/** Splits only received trailing text for the short visual commitment transition. */
export function splitStreamingText(
  text: string,
  active: boolean,
  reducedMotion: boolean,
): StreamingTextParts {
  const trailingLength = active && !reducedMotion ? Math.min(text.length, 48) : 0;
  return {
    stableText: trailingLength > 0 ? text.slice(0, -trailingLength) : text,
    trailingText: trailingLength > 0 ? text.slice(-trailingLength) : '',
  };
}
