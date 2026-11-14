import { useEffect, useRef, type KeyboardEvent } from 'react';
import { CircleAlertIcon, TriangleAlertIcon } from 'lucide-react';
import type { LatexOutlineNode } from '@clio/core/v3';
import type { LatexOutlineRow, LatexPlace, LatexProblem } from './latex-model';
import { ListGroupLabel, ListRow } from './primitives/list-row';
import { t, ph } from '@lingui/core/macro';

/**
 * Where a problem is: its line in the entry file, or its file and line elsewhere.
 * The message comes first: when both do not fit, the place drops whole.
 */
function ProblemPlace({ problem, entry }: { problem: LatexProblem; entry: string }) {
  const file = problem.file && problem.file !== entry ? problem.file : '';
  const line = problem.line ? t`line ${ph({ line: problem.line })}` : '';
  if (!file && !line) return null;
  return (
    <span
      className="flex items-baseline text-meta text-muted-foreground"
      data-slot="latex-problem-place"
    >
      {file ? (
        <span>
          {file}
          {line ? ',\u00a0' : ''}
        </span>
      ) : null}
      {line ? <span className="shrink-0 tabular-nums">{line}</span> : null}
    </span>
  );
}

function problemPlace(problem: LatexProblem, entry: string): string {
  const file = problem.file && problem.file !== entry ? problem.file : '';
  const line = problem.line ? t`line ${ph({ line: problem.line })}` : '';
  return [file, line].filter(Boolean).join(', ');
}

function activateOnKey(run: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    run();
  };
}

/** The deepest section that holds the place shown in the source. */
function currentSection(rows: readonly LatexOutlineRow[], place?: LatexPlace) {
  if (!place?.line) return undefined;
  let found: LatexOutlineRow | undefined;
  for (const row of rows) {
    const { file, start_line: start, end_line: end } = row.node;
    if (file === place.file && place.line >= start && place.line <= end) found = row;
  }
  return found;
}

/**
 * The LaTeX tab's list: its outline (sections and subsections, indented) and
 * its build problems. Picking an entry shows it in the source and the PDF.
 * `revealProblems` changes to bring the problems into view; `filtered` says a
 * search narrowed them.
 */
export function LatexListSections({
  rows,
  problems,
  entry,
  place,
  revealProblems,
  filtered = false,
  onSection,
  onProblem,
}: {
  rows: readonly LatexOutlineRow[];
  problems: readonly LatexProblem[];
  entry: string;
  place?: LatexPlace;
  revealProblems: number;
  /** A search narrows the rows: an empty part reads as no match, not as none at all. */
  filtered?: boolean;
  onSection: (node: LatexOutlineNode) => void;
  onProblem: (problem: LatexProblem) => void;
}) {
  const problemsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (revealProblems) problemsRef.current?.scrollIntoView({ block: 'start' });
  }, [revealProblems]);
  const current = currentSection(rows, place);
  return (
    <div className="flex flex-col p-1" data-slot="latex-list">
      <nav aria-label={t`Paper outline`}>
        {rows.length ? (
          <div role="list">
            {rows.map((row) => {
              const name = row.node.title || row.node.labels?.[0] || row.node.kind;
              return (
                <div key={`${row.number}:${row.node.file}:${row.node.start_line}`} role="listitem">
                  <ListRow
                    aria-current={row === current ? 'location' : undefined}
                    className="cursor-pointer"
                    onClick={() => onSection(row.node)}
                    onKeyDown={activateOnKey(() => onSection(row.node))}
                    role="button"
                    selected={row === current}
                    style={{ paddingLeft: 6 + row.depth * 20 }}
                    tabIndex={0}
                    title={`${row.number} ${name}`}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-1.5 py-1.5 text-menu text-muted-foreground">
            {filtered ? t`No matching sections.` : t`No sections yet.`}
          </p>
        )}
      </nav>
      <section aria-label={t`Problems`} className="scroll-mt-1" ref={problemsRef}>
        <ListGroupLabel className="mt-1.5">{t`Problems`}</ListGroupLabel>
        {problems.length ? (
          <div aria-label={t`Build problems`} role="list">
            {problems.map((problem, index) => {
              const where = problemPlace(problem, entry);
              const severity = problem.severity === 'error' ? 'Error' : 'Warning';
              const Icon = problem.severity === 'error' ? CircleAlertIcon : TriangleAlertIcon;
              const go = () => onProblem(problem);
              return (
                // oxlint-disable-next-line react/no-array-index-key -- problems repeat their text
                <div key={index} role="listitem" title={`${severity}: ${problem.detail}`}>
                  <ListRow
                    aria-disabled={problem.file ? undefined : true}
                    aria-label={`${severity}: ${problem.title}${where ? `, ${where}` : ''}`}
                    className={problem.file ? 'cursor-pointer' : 'cursor-default'}
                    columns={<ProblemPlace entry={entry} problem={problem} />}
                    icon={
                      <Icon
                        className={
                          problem.severity === 'error' ? 'text-destructive' : 'text-warning'
                        }
                      />
                    }
                    onClick={problem.file ? go : undefined}
                    onKeyDown={problem.file ? activateOnKey(go) : undefined}
                    role="button"
                    tabIndex={0}
                    title={problem.title}
                    titleFirst
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-1.5 py-1.5 text-menu text-muted-foreground">
            {filtered ? t`No matching problems.` : t`No problems.`}
          </p>
        )}
      </section>
    </div>
  );
}
