import { useState } from 'react';
import { GripVerticalIcon } from 'lucide-react';
import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { InfoTip } from './info-tip';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

const descriptions: Record<string, string> = {
  duckduckgo: t`General web search.`,
  brave: t`General web search using Brave’s index.`,
  mojeek: t`General web search using an independent index.`,
  qwant: t`General web search.`,
  startpage: t`General web search.`,
  wikipedia: t`Encyclopedia articles.`,
  arxiv: t`Research preprints.`,
  crossref: t`Scholarly publications and DOI metadata.`,
  'semantic scholar': t`Research papers and citations.`,
  pubmed: t`Biomedical literature.`,
};
const csv = (value: string) => [
  ...new Set(
    value
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  ),
];

/** Compose the existing engine list without hiding disabled engines or requiring CSV editing. */
export function SearchEnginePicker({
  value,
  defaults,
  optIn,
  onChange,
  onOptIn,
}: {
  value: string;
  defaults: string;
  optIn: string;
  onChange: (value: string) => void;
  onOptIn: (value: string) => void;
}) {
  const enabled = csv(value || defaults);
  const [known, setKnown] = useState(() => csv(value));
  const [optInChoices, setOptInChoices] = useState(() => csv(optIn));
  const choices = [...new Set([...known, ...enabled, ...csv(defaults), ...csv(optIn)])];
  const [custom, setCustom] = useState('');
  // The saved/draft value owns enabled order, including an external Discard.
  // Keep disabled rows in their slots instead of moving them while toggling.
  let enabledIndex = 0;
  const ordered = choices.map((name) => (enabled.includes(name) ? enabled[enabledIndex++] : name));
  const enable = (name: string, checked: boolean) => {
    setKnown(ordered);
    const next = checked
      ? ordered.filter((item) => enabled.includes(item) || item === name)
      : enabled.filter((item) => item !== name);
    if (next.length) onChange(next.join(','));
    if (!checked)
      onOptIn(
        csv(optIn)
          .filter((item) => item !== name)
          .join(','),
      );
    else if (optInChoices.includes(name)) onOptIn([...new Set([...csv(optIn), name])].join(','));
  };
  const enabledCount = enabled.length;
  return (
    <section aria-label={t`Search engines`} className="space-y-3">
      <div>
        <h4 className="text-sm font-medium">
          <Trans>
            Search engines{' '}
            <span className="ml-1 text-muted-foreground">{enabledCount} enabled</span>
          </Trans>
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {t`Enable the sources you want. Drag to arrange the list; result ranking is handled by SearXNG.`}
        </p>
      </div>
      <Sortable
        value={ordered}
        getItemValue={(name) => name}
        strategy="vertical"
        onValueChange={(next) => {
          setKnown(next);
          onChange(next.filter((name) => enabled.includes(name)).join(','));
        }}
      >
        <div className="divide-y border-y" role="list" aria-label={t`Configured search engines`}>
          {ordered.map((name) => (
            <SortableItem
              key={name}
              value={name}
              role="listitem"
              tabIndex={-1}
              className="flex items-center gap-3 px-3 py-2"
            >
              <SortableItemHandle asChild>
                <Button size="icon-sm" variant="ghost" aria-label={t`Reorder ${name}`}>
                  <GripVerticalIcon />
                </Button>
              </SortableItemHandle>
              <span
                className={`min-w-0 flex-1 text-sm ${enabled.includes(name) ? '' : 'text-muted-foreground'}`}
              >
                {name}
              </span>
              <InfoTip label={t`About ${name}`}>
                {descriptions[name] ||
                  t`A configured SearXNG engine. Availability and key requirements depend on the installed SearXNG version.`}
              </InfoTip>
              <Switch
                aria-label={t`Enable ${name}`}
                checked={enabled.includes(name)}
                disabled={enabled.length === 1 && enabled.includes(name)}
                onCheckedChange={(checked) => enable(name, checked)}
              />
            </SortableItem>
          ))}
        </div>
      </Sortable>
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {t`Add another engine`}
        </summary>
        <div className="mt-3 flex gap-2">
          <Input
            aria-label={t`Additional SearXNG engine`}
            placeholder={t`Exact SearXNG engine name`}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!custom.trim() || custom.includes(',')}
            onClick={() => {
              setKnown([...new Set([...ordered, custom.trim()])]);
              onChange([...new Set([...enabled, custom.trim()])].join(','));
              setCustom('');
            }}
          >
            {t`Add`}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t`Some engines need a key. Engines such as baidu, sogou and 360search require explicit opt-in.`}
        </p>
        <Button
          className="mt-2"
          size="sm"
          variant="ghost"
          disabled={!custom.trim() || custom.includes(',')}
          onClick={() => {
            const name = custom.trim();
            setKnown([...new Set([...ordered, name])]);
            setOptInChoices((previous) => [...new Set([...previous, name])]);
            onOptIn([...new Set([...csv(optIn), name])].join(','));
            onChange([...new Set([...enabled, name])].join(','));
            setCustom('');
          }}
        >
          {t`Add and explicitly allow opt-in engine`}
        </Button>
      </details>
    </section>
  );
}
