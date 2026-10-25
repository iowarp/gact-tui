import type { AgentResolution } from '@clio/core/v3';
import { ChevronRightIcon, SearchIcon } from 'lucide-react';
import { useDeferredValue, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  fragmentOwnerLabel,
  promptSectionLabel,
  unwrapFragmentText,
} from '@/lib/plugin-presentation';

type Fragment = AgentResolution['prompt']['sections'][number]['fragments'][number];

/**
 * The main prompt as the agent receives it: five fixed sections, each made of
 * fragments, and every fragment attributed to the plugin (or agent) that owns
 * it, so "why does the agent say this?" has one answer. Each fragment reads as
 * one line until opened, and a search narrows the list to the fragments that
 * mention a word.
 */
export function ComposedPromptView({ resolution }: { resolution: AgentResolution }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const needle = useDeferredValue(query.trim().toLowerCase());
  const sections = resolution.prompt.sections;
  const all = sections.flatMap((section) => section.fragments);
  const matches = (fragment: Fragment) =>
    !needle ||
    [fragment.id, fragmentOwnerLabel(fragment.plugin), unwrapFragmentText(fragment.text)].some(
      (value) => value.toLowerCase().includes(needle),
    );
  const shown = sections
    .map((section) => ({ ...section, fragments: section.fragments.filter(matches) }))
    .filter((section) => !needle || section.fragments.length);
  const shownCount = shown.reduce((count, section) => count + section.fragments.length, 0);
  const allOpen = shownCount > 0 && shown.every((s) => s.fragments.every((f) => open.has(f.id)));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search the prompt"
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the prompt"
              type="search"
              value={query}
            />
          </div>
          <Button
            disabled={!shownCount}
            onClick={() =>
              setOpen(
                allOpen
                  ? new Set()
                  : new Set(shown.flatMap((section) => section.fragments.map((f) => f.id))),
              )
            }
            size="sm"
            variant="outline"
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {needle
            ? `${shownCount} of ${all.length} ${all.length === 1 ? 'fragment matches' : 'fragments match'}.`
            : `${all.length} ${all.length === 1 ? 'fragment' : 'fragments'} in ${sections.length} ${
                sections.length === 1 ? 'section' : 'sections'
              }, in the order the agent reads them.`}
        </p>
      </div>
      {resolution.prompt.warnings.length ? (
        <details className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <summary className="cursor-pointer text-warning">
            {resolution.prompt.warnings.length}{' '}
            {resolution.prompt.warnings.length === 1 ? 'prompt warning' : 'prompt warnings'}
          </summary>
          <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted-foreground">
            {resolution.prompt.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {shown.map((section) => (
        <section
          aria-label={`${promptSectionLabel(section.section)} section`}
          className="grid gap-1.5"
          key={section.section}
        >
          <h3 className="flex items-baseline gap-2 text-sm font-semibold">
            {promptSectionLabel(section.section)}
            <span className="text-xs font-normal text-muted-foreground">
              {section.fragments.length
                ? `${section.fragments.length} ${section.fragments.length === 1 ? 'fragment' : 'fragments'}`
                : 'Empty'}
            </span>
          </h3>
          {section.fragments.map((fragment) => (
            <FragmentRow
              fragment={fragment}
              key={fragment.id}
              needle={needle}
              onToggle={() => toggle(fragment.id)}
              open={open.has(fragment.id)}
            />
          ))}
        </section>
      ))}
      {needle && !shownCount ? (
        <p className="text-sm text-muted-foreground">No fragment mentions “{query.trim()}”.</p>
      ) : null}
    </div>
  );
}

/** Characters of context kept before a match in a collapsed fragment's one-line preview. */
const PREVIEW_LEAD = 24;

function FragmentRow({
  fragment,
  open,
  onToggle,
  needle,
}: {
  fragment: Fragment;
  open: boolean;
  onToggle: () => void;
  needle: string;
}) {
  const text = unwrapFragmentText(fragment.text);
  const flat = text.replace(/\s+/gu, ' ').trim();
  const at = needle ? flat.toLowerCase().indexOf(needle) : -1;
  const preview = at > PREVIEW_LEAD ? `…${flat.slice(at - PREVIEW_LEAD)}` : flat;
  const owner = fragmentOwnerLabel(fragment.plugin);
  return (
    <article
      aria-label={`${fragment.id} from ${owner}`}
      className="min-w-0 rounded-md border bg-card"
    >
      <button
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggle}
        type="button"
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        <Badge className="shrink-0" variant="secondary">
          {owner}
        </Badge>
        <span className="shrink-0 font-mono text-xs text-muted-foreground max-sm:hidden">
          {fragment.id}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {open ? null : <Highlighted text={preview} needle={needle} />}
        </span>
        {fragment.tokens !== undefined ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            ~{fragment.tokens} tokens
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="border-t px-3 py-2">
          <p className="mb-1 font-mono text-xs text-muted-foreground sm:hidden">{fragment.id}</p>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
            <Highlighted text={text} needle={needle} />
          </pre>
        </div>
      ) : null}
    </article>
  );
}

/** The text with each case-insensitive occurrence of the search marked. */
function Highlighted({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    parts.push(text.slice(from, at));
    parts.push(
      <mark className="rounded-sm bg-warning/30 text-inherit" key={at}>
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}
