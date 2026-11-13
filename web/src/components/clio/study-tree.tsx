import type { ScienceView } from '@clio/core/v3';
import { LayoutGridIcon } from 'lucide-react';
import { useMemo, type KeyboardEvent } from 'react';
import { StudyNodeIcon } from './science-log-icons';
import type { StudyNode, StudyTopic } from './science-log-model';
import { ListGroupLabel, ListRow } from './primitives/list-row';
import { MetaValue } from './primitives/tag';
import { StateView } from './primitives/state-view';
import { ph, plural, t } from '@lingui/core/macro';

/** The node's kind in text, so a fork, a step and a reframe read differently without color. */
function studyKindLabel(node: StudyNode): string {
  if (node.kind === 'question') return t`Question`;
  if (node.kind === 'hypothesis') return t`Hypothesis`;
  if (node.kind === 'reframe') return t`Reframe`;
  switch (node.branchRelation) {
    case 'fork':
      return t`Fork`;
    case 'step':
      return t`Step`;
    case 'delegated':
      return t`Delegated`;
    case 'branch':
      return t`Branch`;
    case 'root':
      return t`Root`;
    default:
      return t`Branch`;
  }
}

function tooltip(node: StudyNode): string {
  const parts = [
    t`${ph({ kind: studyKindLabel(node) })}: ${ph({ title: node.title })}`,
    t`State: ${ph({ state: node.state.label })}`,
  ];
  if (node.relation) parts.push(node.relation);
  if (node.note) parts.push(t`Note: ${ph({ note: node.note })}`);
  if (node.derivedFrom.length)
    parts.push(
      t`Derived from ${ph({ sources: node.derivedFrom.map((edge) => edge.title).join(', ') })}`,
    );
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
  /** Show only the rows whose title holds this text (and the rows above them). */
  query?: string;
}

/** The tree's selected row: the accent fill, as the workbench file tree marks its row. */
const SELECTED_ROW =
  'data-selected:bg-accent data-selected:text-accent-foreground data-selected:hover:bg-accent data-selected:[&_[aria-hidden=true]]:text-accent-foreground';

/**
 * The rows the tree shows: the study and its first level always; a deeper row
 * only under the picked topic, so the list opens two levels deep.
 */
function visibleTopics(topics: readonly StudyTopic[], selected: string | undefined): StudyTopic[] {
  const open = new Set<string>();
  const trail: StudyTopic[] = [];
  for (const topic of topics) {
    trail.length = topic.depth;
    trail.push(topic);
    if (topic.node.key === selected) for (const row of trail) open.add(row.node.key);
  }
  const shown: StudyTopic[] = [];
  const parents: StudyTopic[] = [];
  for (const topic of topics) {
    parents.length = topic.depth;
    const parent = parents.at(-1);
    if (topic.depth < 2 || (parent && open.has(parent.node.key))) shown.push(topic);
    parents.push(topic);
  }
  return shown;
}

/** The rows a search keeps: each match at any depth, with the rows it sits under. */
function matchingTopics(topics: readonly StudyTopic[], needle: string): StudyTopic[] {
  const keep = new Set<StudyTopic>();
  const trail: StudyTopic[] = [];
  for (const topic of topics) {
    trail.length = topic.depth;
    trail.push(topic);
    if (topic.node.title.toLowerCase().includes(needle)) for (const row of trail) keep.add(row);
  }
  return topics.filter((topic) => keep.has(topic));
}

/**
 * The study beside the tabs: the study itself, then its hypotheses and branches
 * with how many entries each holds, then the dashboards it attached. Picking a
 * topic narrows the log to it and opens its own topics; picking a view opens it.
 */
export function StudyTree({
  name,
  topics,
  selected,
  onSelectTopic,
  views: allViews = [],
  onOpenView,
  query = '',
}: StudyTreeProps) {
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? matchingTopics(topics, needle) : visibleTopics(topics, selected)),
    [needle, topics, selected],
  );
  const views = needle
    ? allViews.filter((view) => (view.title || t`Untitled view`).toLowerCase().includes(needle))
    : allViews;
  if (needle && !shown.length && !views.length)
    return <StateView kind="empty" size="row" title={t`Nothing in this study matches`} />;
  return (
    <div
      aria-label={t`Study tree`}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-0.5 px-1.5 py-1"
      role="group"
    >
      <h3 className="sr-only" id="study-tree-study">
        {t`Study`}
      </h3>
      <div
        aria-labelledby="study-tree-study"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)]"
        role="list"
      >
        {shown.map((topic, index) => {
          const { node, depth } = topic;
          const root = node.kind === 'question' && depth === 0;
          const title = root ? name : node.title;
          const count = topic.entries.length;
          const nested =
            !root && topic.node.children.length > 0
              ? shown[index + 1]?.depth === topic.depth + 1
              : undefined;
          const label = root
            ? plural(count, { one: `Study: ${name}, # entry`, other: `Study: ${name}, # entries` })
            : count
              ? plural(count, {
                  one: `${ph({ kind: studyKindLabel(node) })}: ${ph({ title: node.title })}, ${ph({ state: node.state.label })}, # entry`,
                  other: `${ph({ kind: studyKindLabel(node) })}: ${ph({ title: node.title })}, ${ph({ state: node.state.label })}, # entries`,
                })
              : t`${ph({ kind: studyKindLabel(node) })}: ${ph({ title: node.title })}, ${ph({ state: node.state.label })}`;
          return (
            <div
              data-kind={node.kind}
              data-relation={node.branchRelation}
              key={node.key}
              role="listitem"
              title={tooltip(node)}
            >
              <ListRow
                aria-expanded={nested}
                aria-label={label}
                aria-pressed={selected === node.key}
                className={`cursor-default ${SELECTED_ROW}`}
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
            {t`Views`}
          </ListGroupLabel>
          <div
            aria-labelledby="study-tree-views"
            className="grid min-w-0 grid-cols-[minmax(0,1fr)]"
            role="list"
          >
            {views.map((view) => {
              const key = `view:${view.entry}`;
              const title = view.title || t`Untitled view`;
              return (
                <div key={view.entry} role="listitem" title={view.purpose || title}>
                  <ListRow
                    aria-disabled={onOpenView ? undefined : true}
                    aria-label={t`View: ${title}`}
                    aria-pressed={selected === key}
                    className={`cursor-default ${SELECTED_ROW}`}
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
