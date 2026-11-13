import type { AgentResolution } from '@clio/core/v3';
import { ChevronRightIcon, SearchIcon } from 'lucide-react';
import { lazy, Suspense, useDeferredValue, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  fragmentOwnerLabel,
  promptSectionLabel,
  unwrapFragmentText,
} from '@/lib/plugin-presentation';
import { plural, t, ph } from '@lingui/core/macro';

type Fragment = AgentResolution['prompt']['sections'][number]['fragments'][number];
const FullPromptDocument = lazy(async () => ({
  default: (await import('./file-text-view')).FileTextView,
}));

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
  // Prefer the server's exact assembled text. Older servers expose only the
  // ordered fragments, composed with the same blank-line separator.
  const fullPrompt =
    resolution.prompt.text ??
    all
      .map((fragment) => fragment.text)
      .filter(Boolean)
      .join('\n\n');
  const agentName = resolution.agent.name || resolution.agent.id;
  const promptName = t`${agentName} system prompt`;
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
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={t`Search the prompt`}
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t`Search the prompt`}
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
            {allOpen ? t`Collapse all` : t`Expand all`}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={!fullPrompt} size="sm" variant="outline">
                {t`See all`}
              </Button>
            </DialogTrigger>
            {/* The viewer's own 34px frame bar is the header: its end keeps clear of the close
                button, which centres on the bar. */}
            <DialogContent className="flex h-[min(48rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl [&_[data-slot=file-text-view]>[data-slot=frame-bar]]:pr-11 [&>[data-slot=dialog-close]]:top-[3px] [&>[data-slot=dialog-close]]:right-1.5">
              <DialogTitle className="sr-only">{promptName}</DialogTitle>
              <DialogDescription className="sr-only">
                {t`The complete composed system prompt for ${ph({ agent: resolution.agent.name || resolution.agent.id })}.`}
              </DialogDescription>
              <Suspense
                fallback={
                  <p role="status" className="p-4">
                    {t`Loading prompt…`}
                  </p>
                }
              >
                <FullPromptDocument name={promptName} content={fullPrompt} format="markdown" />
              </Suspense>
            </DialogContent>
          </Dialog>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {needle
            ? plural(all.length, {
                one: `${shownCount} of # fragment matches.`,
                other: `${shownCount} of # fragments match.`,
              })
            : plural(all.length, {
                one: `# fragment in ${plural(sections.length, { one: '# section', other: '# sections' })}, in the order the agent reads them.`,
                other: `# fragments in ${plural(sections.length, { one: '# section', other: '# sections' })}, in the order the agent reads them.`,
              })}
        </p>
      </div>
      {resolution.prompt.warnings.length ? (
        <details className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <summary className="cursor-pointer text-warning">
            {plural(resolution.prompt.warnings.length, {
              one: '# prompt warning',
              other: '# prompt warnings',
            })}
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
          aria-label={t`${ph({ section: promptSectionLabel(section.section) })} section`}
          className="grid gap-1.5"
          key={section.section}
        >
          <h3 className="flex items-baseline gap-2 text-sm font-semibold">
            {promptSectionLabel(section.section)}
            <span className="text-xs font-normal text-muted-foreground">
              {section.fragments.length
                ? plural(section.fragments.length, { one: '# fragment', other: '# fragments' })
                : t`Empty`}
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
        <p className="text-sm text-muted-foreground">{t`No fragment mentions “${ph({ query: query.trim() })}”.`}</p>
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
      aria-label={t`${ph({ id: fragment.id })} from ${owner}`}
      className="min-w-0 rounded-md border bg-card"
    >
      <button
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggle}
        type="button"
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cn('size-3.5 shrink-0 text-muted-foreground', open && 'rotate-90')}
        />
        <Badge
          className="min-w-0 max-w-[40%] shrink truncate transition-colors"
          title={owner}
          variant="secondary"
        >
          {owner}
        </Badge>
        <span className="shrink-0 font-mono text-xs text-muted-foreground max-sm:hidden">
          {fragment.id}
        </span>
        {/* A preview squeezed under ~3ch would show only a stray glyph, so it hides. */}
        <span className="@container min-w-0 flex-1 text-sm">
          {open ? null : (
            <span className="block truncate @max-[2rem]:hidden">
              <Highlighted text={preview} needle={needle} />
            </span>
          )}
        </span>
        {fragment.tokens !== undefined ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {plural(fragment.tokens, { one: '~# token', other: '~# tokens' })}
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
