import { Fragment } from 'react';

/** A path that wraps only after its separators, never in the middle of a name. */
export function PathText({ path }: { path: string }) {
  const parts = path.split(/(?<=[/\\])/u);
  const keys = parts.map((_, index) => parts.slice(0, index + 1).join(''));
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={keys[index]}>
          {part}
          {index < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </>
  );
}
