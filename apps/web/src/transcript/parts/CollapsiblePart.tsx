import { useState, type ReactNode } from 'react';

export interface CollapsiblePartProps {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/**
 * The prototype's collapsed part — a chevron, a summary line, and a body that
 * is not rendered until asked for ("thinking (77 tokens)").
 *
 * The body is genuinely absent while collapsed rather than hidden with CSS, so
 * a long reasoning block costs nothing until it is opened.
 */
export function CollapsiblePart({ summary, children, defaultOpen = false }: CollapsiblePartProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="part-collapsible">
      <button
        type="button"
        className="part-collapsible__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="part-collapsible__chev" data-open={open ? 'true' : undefined} aria-hidden="true">
          ›
        </span>
        {summary}
      </button>
      {open ? <div className="part-collapsible__body">{children}</div> : null}
    </div>
  );
}
