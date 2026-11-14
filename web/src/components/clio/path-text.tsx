import { Fragment } from 'react';

/**
 * Inside one name: a break after a dot, colon or hyphen, used only when the name can't fit a
 * line. Its trailing separator stays joined to the last character, so it never wraps alone.
 */
function NamePart({ part }: { part: string }) {
  const chars = Array.from(part);
  const tail = /[/\\]$/u.test(part) && chars.length > 1 ? chars.slice(-2).join('') : '';
  const head = tail ? chars.slice(0, -2).join('') : part;
  const pieces = head ? head.split(/(?<=[.:-])(?=.)/u) : [];
  return (
    <span className="inline-block max-w-full [overflow-wrap:anywhere]">
      {pieces.map((piece, index) => (
        <Fragment key={pieces.slice(0, index + 1).join('')}>
          {index ? <wbr /> : null}
          {piece}
        </Fragment>
      ))}
      {tail ? <span className="whitespace-nowrap">{tail}</span> : null}
    </span>
  );
}

/**
 * A path that wraps after its separators. Each part is its own box, so a name that fits
 * stays whole; one wider than the line breaks after a dot, colon or hyphen first.
 */
export function PathText({ path }: { path: string }) {
  // A leading root ("\\" of a share, "/") belongs to the first name, never a line of its own.
  const [, root = '', rest = ''] = /^([/\\]*)(.*)$/su.exec(path) ?? [];
  const parts = rest.split(/(?<=[/\\])/u);
  parts[0] = root + (parts[0] ?? '');
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
