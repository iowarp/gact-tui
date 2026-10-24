import type { AgentResolution } from '@clio/core/v3';
import { Badge } from '@/components/ui/badge';
import {
  fragmentOwnerLabel,
  promptSectionLabel,
  unwrapFragmentText,
} from '@/lib/plugin-presentation';

/**
 * The main prompt as the agent receives it: five fixed sections, each made of
 * fragments, and every fragment attributed to the plugin (or agent) that owns
 * it, so "why does the agent say this?" has one answer.
 */
export function ComposedPromptView({ resolution }: { resolution: AgentResolution }) {
  const sections = resolution.prompt.sections;
  const fragments = sections.reduce((count, section) => count + section.fragments.length, 0);
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {fragments} {fragments === 1 ? 'fragment' : 'fragments'} in {sections.length}{' '}
        {sections.length === 1 ? 'section' : 'sections'}, in the order the agent reads them.
      </p>
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
      {sections.map((section) => (
        <section
          aria-label={`${promptSectionLabel(section.section)} section`}
          className="grid gap-2"
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
            <article
              aria-label={`${fragment.id} from ${fragmentOwnerLabel(fragment.plugin)}`}
              className="min-w-0 rounded-lg border bg-card"
              key={fragment.id}
            >
              <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <Badge variant="secondary">{fragmentOwnerLabel(fragment.plugin)}</Badge>
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {fragment.id}
                </span>
                {fragment.tokens !== undefined ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    About {fragment.tokens} tokens
                  </span>
                ) : null}
              </header>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-sans text-sm leading-6">
                {unwrapFragmentText(fragment.text)}
              </pre>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
