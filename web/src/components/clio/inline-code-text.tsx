import { Fragment } from 'react';

/**
 * One line of agent text (a todo, a plan title) with its `backtick` spans drawn as inline
 * code, as Markdown draws them. Nothing else is parsed; the backticks themselves are not shown.
 */
export function InlineCodeText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/u);
  if (parts.length < 2) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        part.length > 2 && part.startsWith('`') && part.endsWith('`') ? (
          <code
            className="rounded-[4px] bg-muted px-1 py-px font-mono text-[0.9em]"
            data-streamdown="inline-code"
            key={index}
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
