import { useContext, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BoundedResult } from './bounded-result';
import { asRecord } from './tool-result-shared';
import { PresentationNavigation } from './presentation-navigation';
import { PresentationLink } from './presentation-link';
import { operationSubject } from './tool-operation-data';
import { ToolOperationValue } from './tool-operation-value';

/** Search families share named matches, excerpts and paging, not transport-object tables. */
export function ToolOperationSearch({ value }: { value: unknown }) {
  const navigation = useContext(PresentationNavigation);
  const [page, setPage] = useState(0);
  if (!Array.isArray(value)) return <ToolOperationValue value={value} />;
  const size = 8;
  return (
    <div className="min-w-0 space-y-3">
      <ul className="divide-y">
        {value.slice(page * size, (page + 1) * size).map((item, index) => {
          const row = asRecord(item);
          if (!row)
            return (
              <li key={index} className="py-2">
                <ToolOperationValue value={item} />
              </li>
            );
          const name =
            typeof row.title === 'string'
              ? row.title
              : typeof row.name === 'string'
                ? row.name
                : typeof row.label === 'string'
                  ? row.label
                  : undefined;
          const handle =
            typeof row.handle === 'string'
              ? row.handle
              : typeof row.task_id === 'string'
                ? row.task_id
                : undefined;
          const url = typeof row.url === 'string' ? row.url : undefined;
          const session =
            typeof row.child_session_id === 'string'
              ? row.child_session_id
              : typeof row.session_id === 'string'
                ? row.session_id
                : undefined;
          const path = typeof row.path === 'string' ? row.path : undefined;
          const subject = handle
            ? operationSubject(
                handle,
                { subagents: navigation?.subagents },
                session
                  ? { id: handle, type: 'link', target: 'session', uri: session, label: name }
                  : undefined,
                name,
              )
            : {
                id: `match-${index}`,
                type: 'link' as const,
                target: url
                  ? ('url' as const)
                  : session
                    ? ('session' as const)
                    : path
                      ? ('file' as const)
                      : undefined,
                uri: url || session || path,
                label: name || path || url,
              };
          const excerpt = [
            row.snippet,
            row.excerpt,
            row.matched_passage,
            row.text,
            row.summary,
            row.content,
          ].find((v): v is string => typeof v === 'string' && Boolean(v));
          return (
            <li key={index} className="min-w-0 space-y-1 py-3">
              {subject.label ? <PresentationLink block={subject} /> : null}
              {typeof row.line === 'number' ? (
                <p className="text-xs text-muted-foreground">Line {row.line}</p>
              ) : null}
              {excerpt ? (
                <BoundedResult lines={4} inlineExpansion>
                  <p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                    {excerpt}
                  </p>
                </BoundedResult>
              ) : !subject.label ? (
                <ToolOperationValue value={row} />
              ) : null}
            </li>
          );
        })}
      </ul>
      {value.length > size ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="mr-auto">
            {page * size + 1}–{Math.min((page + 1) * size, value.length)} of {value.length}
          </span>
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={(page + 1) * size >= value.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
