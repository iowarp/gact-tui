import { Fragment, type ReactNode } from 'react';

/**
 * Offers a line break after the separators inside a host, address, path or model id
 * ("ares.cluster.example.edu", "Qwen/Qwen3-0.6B"), so a narrow row wraps at a dot,
 * slash or hyphen rather than mid-name. A dot before a digit belongs to a version
 * ("Llama-3.1-8B") and is not a break. Prose punctuation followed by a space is left
 * alone.
 */
export function withAddressBreaks(text: string): ReactNode {
  const parts = text.split(/(?<=\S[/\\:@_-])(?=\S)|(?<=\S\.)(?=[^\s\d])/u);
  if (parts.length < 2) return text;
  const keys = parts.map((_, index) => parts.slice(0, index + 1).join(''));
  return parts.map((part, index) => (
    <Fragment key={keys[index]}>
      {index ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}
