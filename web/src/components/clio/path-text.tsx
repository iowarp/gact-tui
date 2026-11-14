import { Fragment } from 'react';

/** Inside one name: a break after a dot, colon or hyphen, used only when the name can't fit a line. */
function NamePart({ part }: { part: string }) {
  const pieces = part.split(/(?<=[.:-])(?=.)/u);
  return (
    <span className="inline-block max-w-full [overflow-wrap:anywhere]">
      {pieces.map((piece, index) => (
        <Fragment key={pieces.slice(0, index + 1).join('')}>
          {index ? <wbr /> : null}
          {piece}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * A path that wraps after its separators. Each part is its own box, so a name that fits
 * stays whole; one wider than the line breaks after a dot, colon or hyphen first.
 */
export function PathText({ path }: { path: string }) {
  const parts = path.split(/(?<=[/\\])/u);
  const keys = parts.map((_, index) => parts.slice(0, index + 1).join(''));
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={keys[index]}>
          <NamePart part={part} />
          {index < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </>
  );
}
