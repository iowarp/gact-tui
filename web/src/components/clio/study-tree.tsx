import type { ScienceView } from '@clio/core/v3';
import { LayoutGridIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { StudyNodeIcon } from './science-log-icons';
import type { StudyNode, StudyTopic } from './science-log-model';
import { ListGroupLabel, ListRow } from './primitives/list-row';
import { MetaValue } from './primitives/tag';

/** The node's kind in text, so a fork, a step and a reframe read differently without color. */
function studyKindLabel(node: StudyNode): string {
  if (node.kind === 'question') return 'Question';
  if (node.kind === 'hypothesis') return 'Hypothesis';
  if (node.kind === 'reframe') return 'Reframe';
  switch (node.branchRelation) {
    case 'fork':
      return 'Fork';
    case 'step':
      return 'Step';
    case 'delegated':
      return 'Delegated';
    case 'branch':
      return 'Branch';
    case 'root':
      return 'Root';
    default:
      return 'Branch';
  }
}

function tooltip(node: StudyNode): string {
  const parts = [`${studyKindLabel(node)}: ${node.title}`, `State: ${node.state.label}`];
  if (node.relation) parts.push(node.relation);
  if (node.note) parts.push(`Note: ${node.note}`);
  if (node.derivedFrom.length)
    parts.push(`Derived from ${node.derivedFrom.map((edge) => edge.title).join(', ')}`);
  return parts.join('. ');
}

function activateOnKey(event: KeyboardEvent<HTMLElement>, run: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  run();
}

export interface StudyTreeProps {
  /** The study's name, for its own row. */
  name: string;
  /** The question, then its hypotheses, reframes and branches, flattened with their depth. */
  topics: readonly StudyTopic[];
  /** The selected row: a topic's key, or `view:` and a view's entry. */
  selected?: string;
  /** Narrow the log to a topic (the study row shows every entry). */
  onSelectTopic: (topic: StudyTopic) => void;
  /** The study's attached views. */
  views?: readonly ScienceView[];
  /** Open one of the study's views. */
  onOpenView?: (view: ScienceView) => void;
}

/**
 * The study beside the tabs: the study itself, then its hypotheses and branches
 * with how many entries each holds, then the dashboards it attached. Picking a
 * topic narrows the log to it; picking a view opens it.
 */
export function StudyTree({
  name,
  topics,
  selected,
  onSelectTopic,
  views = [],
  onOpenView,
}: StudyTreeProps) {
  return (
    <div
      aria-label="Study tree"
      className="grid min-w-0 content-start gap-0.5 px-1.5 py-1"
      role="group"
    >
      <h3 className="sr-only" id="study-tree-study">
        Study
      </h3>
      <div aria-labelledby="study-tree-study" className="grid min-w-0" role="list">
        {topics.map((topic) => {
          const { node, depth } = topic;
          const root = node.kind === 'question' && depth === 0;
          const title = root ? name : node.title;
          const count = topic.entries.length;
          const label = root
            ? `Study: ${name}, ${count} ${count === 1 ? 'entry' : 'entries'}`
            : `${studyKindLabel(node)}: ${node.title}, ${node.state.label}${count ? `, ${count} ${count === 1 ? 'entry' : 'entries'}` : ''}`;
          return (
            <div
              data-kind={node.kind}
              data-relation={node.branchRelation}
              key={node.key}
              role="listitem"
              title={tooltip(node)}
            >
              <ListRow
                aria-label={label}
                aria-pressed={selected === node.key}
                className="cursor-default"
                icon={<StudyNodeIcon node={node} />}
                meta={!root && count ? <MetaValue>{count}</MetaValue> : undefined}
                onClick={() => onSelectTopic(topic)}
                onKeyDown={(event) => activateOnKey(event, () => onSelectTopic(topic))}
                role="button"
                selected={selected === node.key}
                style={{ paddingLeft: 6 + depth * 14 }}
                tabIndex={0}
                title={title}
              />
            </div>
          );
        })}
      </div>
      {views.length ? (
        <>
          <ListGroupLabel className="mt-2" id="study-tree-views">
            Views
          </ListGroupLabel>
          <div aria-labelledby="study-tree-views" className="grid min-w-0" role="list">
            {views.map((view) => {
              const key = `view:${view.entry}`;
              const title = view.title || 'Untitled view';
              return (
                <div key={view.entry} role="listitem" title={view.purpose || title}>
                  <ListRow
                    aria-disabled={onOpenView ? undefined : true}
                    aria-label={`View: ${title}`}
                    aria-pressed={selected === key}
                    className="cursor-default"
                    icon={<LayoutGridIcon />}
                    onClick={() => onOpenView?.(view)}
                    onKeyDown={(event) => activateOnKey(event, () => onOpenView?.(view))}
                    role="button"
                    selected={selected === key}
                    tabIndex={0}
                    title={title}
                  />
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
