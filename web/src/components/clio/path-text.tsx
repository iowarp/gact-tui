import { Fragment } from 'react';

/**
 * A path that wraps only after its separators. Each part is its own box, so a hyphen or
 * space inside a name is never a break; a part wider than the line still wraps.
 */
export function PathText({ path }: { path: string }) {
  const parts = path.split(/(?<=[/\\])/u);
  const keys = parts.map((_, index) => parts.slice(0, index + 1).join(''));
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={keys[index]}>
          <span className="inline-block max-w-full [overflow-wrap:anywhere]">{part}</span>
          {index < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </>
  );
}
