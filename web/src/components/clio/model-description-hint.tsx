import type { ReactNode, SyntheticEvent } from 'react';
import { ExternalLink } from '@/components/ui/external-link';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { InfoIcon } from '@/lib/icon-vocabulary';
import type { ModelFactSummary } from '@/lib/model-facts';

type Description = NonNullable<ModelFactSummary['description']>;

/**
 * Nothing inside the hint may reach the picker row it sits in: React events
 * bubble through the hover card's portal, and a press would pick the model.
 */
function contain(event: SyntheticEvent): void {
  event.stopPropagation();
}

/**
 * The description as text with each of its links clickable where its label
 * appears (the service reduced markdown links to their labels in `plain` and
 * kept the URLs in `links`, in order). A label that cannot be found in the
 * text is listed after it instead.
 */
function linkedText({ plain, links }: Description): { body: ReactNode[]; extra: Description['links'] } {
  const body: ReactNode[] = [];
  const extra: Description['links'][number][] = [];
  let rest = plain;
  links.forEach((link, index) => {
    const at = rest.indexOf(link.text);
    if (!link.text || at < 0) {
      extra.push(link);
      return;
    }
    body.push(rest.slice(0, at));
    body.push(
      <ExternalLink className="text-primary underline underline-offset-2" href={link.url} key={`${index}-${link.url}`} onClick={contain}>
        {link.text}
      </ExternalLink>,
    );
    rest = rest.slice(at + link.text.length);
  });
  body.push(rest);
  return { body, extra };
}

/**
 * An info mark beside a model's name whose hover card says what the model is,
 * in its source's words. Used for routers, whose name alone ("auto", "pareto-
 * code") does not say what they route to.
 */
export function ModelDescriptionHint({ description, name }: { description: Description; name: string }) {
  const { body, extra } = linkedText(description);
  return (
    <HoverCard closeDelay={150} openDelay={200}>
      <HoverCardTrigger asChild>
        <span
          aria-label={`About ${name}`}
          className="inline-flex size-4 shrink-0 cursor-help items-center justify-center text-muted-foreground hover:text-foreground"
          data-slot="model-description-hint"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={contain}
          role="img"
        >
          <InfoIcon aria-hidden="true" className="size-3.5" />
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-96 max-w-[calc(100vw-2rem)] text-sm"
        data-slot="model-description"
        onClick={contain}
        onMouseDown={contain}
        onPointerDown={contain}
        side="right"
      >
        <p className="font-medium">{name}</p>
        <p className="mt-1 leading-relaxed whitespace-pre-line text-muted-foreground">{body}</p>
        {extra.length ? (
          <ul className="mt-2 flex flex-col gap-1">
            {extra.map((link) => (
              <li key={link.url}>
                <ExternalLink className="text-primary underline underline-offset-2" href={link.url} onClick={contain}>
                  {link.text || link.url}
                </ExternalLink>
              </li>
            ))}
          </ul>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
